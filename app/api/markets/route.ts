import { NextResponse } from "next/server";
import { findActiveMarket, extractTimestampFromSlug, fetchHistoricalBTCPrice } from "../../lib/marketUtils";

/**
 * Deep search for reference price in nested API response
 * Checks all possible locations where price to beat might be stored
 */
function findReferencePrice(data: any): number | null {
  if (!data || typeof data !== 'object') return null;

  // Direct fields (already checked, but included for completeness)
  const directFields = [
    'referencePrice', 'reference_price', 'priceToBeat', 'price_to_beat',
    'startPrice', 'start_price', 'initialPrice', 'initial_price',
    'basePrice', 'base_price', 'targetPrice', 'target_price',
    'strikePrice', 'strike_price', 'denomination', 'scalarDenomination'
  ];

  for (const field of directFields) {
    if (data[field] !== undefined && data[field] !== null) {
      const value = parseFloat(data[field]);
      if (!isNaN(value) && value > 0) {
          return value;
      }
    }
  }

    // Check condition object deeply
    if (data.condition) {
      for (const field of directFields) {
        if (data.condition[field] !== undefined && data.condition[field] !== null) {
          const value = parseFloat(data.condition[field]);
          if (!isNaN(value) && value > 0) {
            return value;
          }
        }
      }

      // Check for scalar market fields in condition
      if (data.condition.scalarDenomination) {
        const value = parseFloat(data.condition.scalarDenomination);
        if (!isNaN(value) && value > 0) {
          return value;
        }
      }
    }

  // Check outcomes array
  if (Array.isArray(data.outcomes) && data.outcomes.length > 0) {
    for (let i = 0; i < data.outcomes.length; i++) {
      const outcome = data.outcomes[i];
      if (outcome && typeof outcome === 'object') {
        // Check if outcome has price or scalar value
        if (outcome.price !== undefined) {
          const value = parseFloat(outcome.price);
          if (!isNaN(value) && value > 0) {
            // For binary markets, might need to check both outcomes
          }
        }
        if (outcome.scalarValue !== undefined) {
          const value = parseFloat(outcome.scalarValue);
          if (!isNaN(value) && value > 0) {
          }
        }
      }
    }
  }

  // Check resolutionSource
  if (data.resolutionSource) {
    if (typeof data.resolutionSource === 'object') {
      for (const field of directFields) {
        if (data.resolutionSource[field] !== undefined && data.resolutionSource[field] !== null) {
          const value = parseFloat(data.resolutionSource[field]);
          if (!isNaN(value) && value > 0) {
            return value;
          }
        }
      }
    }
  }

  // Check for scalar market specific fields
  if (data.scalarDenomination !== undefined) {
    const value = parseFloat(data.scalarDenomination);
    if (!isNaN(value) && value > 0) {
      return value;
    }
  }

  // Check metadata or additional fields
  if (data.metadata && typeof data.metadata === 'object') {
    for (const field of directFields) {
      if (data.metadata[field] !== undefined && data.metadata[field] !== null) {
        const value = parseFloat(data.metadata[field]);
        if (!isNaN(value) && value > 0) {
          return value;
        }
      }
    }
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const apiKey = process.env.POLYMARKET_API_KEY;
    const apiUrl = process.env.POLYMARKET_API_URL || "https://clob.polymarket.com";

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "API key not configured" },
        { status: 500 }
      );
    }

    // Find the active 15-minute BTC market
    const result = await findActiveMarket();

    if (!result.success || !('market' in result) || !result.market) {
      return NextResponse.json({
        success: false,
        error: ('error' in result ? result.error : "No active 15-minute BTC market found") as string,
      });
    }

    const data = result.market;

    // Calculate exact 15-minute boundary times from slug timestamp
    // This ensures we use the correct times that match Polymarket's market windows
    let calculatedStartTime: string | undefined;
    let calculatedEndTime: string | undefined;
    const slug = data.slug || result.slug;
    
    if (slug) {
      const timestamp = extractTimestampFromSlug(slug);
      if (timestamp) {
        // Start time is the timestamp (15-minute boundary)
        calculatedStartTime = new Date(timestamp * 1000).toISOString();
        // End time is 15 minutes later (900 seconds)
        calculatedEndTime = new Date((timestamp + 900) * 1000).toISOString();
      }
    }
    
    // Use calculated times if available, otherwise fall back to API times
    const startTime = calculatedStartTime || data.startDate || data.start_time || data.createdAt;
    const endTime = calculatedEndTime || data.endDate || data.end_time;
    
    // Reference price - removed Polymarket API call (no external APIs)
    // Websocket data provides real-time prices
    let polymarketPrice: number | null = null;
    let polymarketSource = "none";
    
    // Priority 1: Deep search for reference price in API response
    const foundReferencePrice = findReferencePrice(data);
    
    // Priority 3: Try fallback fields if deep search didn't find it
    const fallbackPrice = data.referencePrice || 
                         data.reference_price || 
                         data.priceToBeat || 
                         data.price_to_beat ||
                         data.startPrice ||
                         data.start_price ||
                         data.initialPrice ||
                         data.initial_price ||
                         data.condition?.referencePrice ||
                         data.condition?.priceToBeat ||
                         null;
    
    // Priority 4: Extract timestamp from slug to fetch historical price
    let historicalPrice: number | null = null;
    let historicalSource = "none";
    
    if (slug && !polymarketPrice) {
      const timestamp = extractTimestampFromSlug(slug);
      if (timestamp) {
        const historicalResult = await fetchHistoricalBTCPrice(timestamp);
        if (historicalResult.success && historicalResult.price) {
          historicalPrice = historicalResult.price;
          historicalSource = historicalResult.source;
        }
      }
    }
    
    // Priority order: Polymarket API > Deep search > Historical > Fallback
    const finalReferencePrice = polymarketPrice || foundReferencePrice || historicalPrice || fallbackPrice;
    const priceFound = finalReferencePrice !== null;
    let priceSource = "none";
    if (polymarketPrice) {
      priceSource = polymarketSource;
    } else if (foundReferencePrice) {
      priceSource = "api_deep_search";
    } else if (historicalPrice) {
      priceSource = `historical_${historicalSource}`;
    } else if (fallbackPrice) {
      priceSource = "api_fallback";
    }

    // Extract event ID (parent event for comments)
    // Comments are typically on the parent event, not individual 15-minute markets
    const eventId = data.eventId || 
                    data.event_id || 
                    data.event?.id ||
                    data.event?.eventId ||
                    data.parentEventId ||
                    data.parent_event_id ||
                    data.condition?.eventId ||
                    data.condition?.event_id ||
                    null;

    // Extract asset IDs (clobTokenIds) for orderbook
    let assetIds: string[] = [];
    if (data.clobTokenIds) {
      try {
        assetIds = typeof data.clobTokenIds === 'string' 
          ? JSON.parse(data.clobTokenIds)
          : data.clobTokenIds;
      } catch {
        assetIds = Array.isArray(data.clobTokenIds) ? data.clobTokenIds : [];
      }
    }

    // Map Gamma API response to our format
    const market = {
      id: data.id || data.slug || result.slug,
      slug: data.slug || result.slug,
      title: data.question || data.title || "Bitcoin Up or Down",
      description: data.description || "",
      startTime: calculatedStartTime || data.startDate || data.start_time || data.createdAt,
      endTime: calculatedEndTime || data.endDate || data.end_time,
      resolutionSource: data.resolutionSource || data.resolution_source,
      volume: data.volume || 0,
      liquidity: data.liquidity || 0,
      outcomes: data.outcomes || [],
      condition: data.condition || {},
      eventId: eventId, // Parent event ID for comments
      assetIds: assetIds, // Asset IDs for CLOB orderbook
      referencePrice: finalReferencePrice,
      referencePriceStatus: {
        found: priceFound,
        source: priceSource,
        value: finalReferencePrice,
      },
      // Additional fields that might be in the response
      raw: data,
    };

    return NextResponse.json({
      success: true,
      market: market,
      markets: [market], // Return as array for consistency
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch markets",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
