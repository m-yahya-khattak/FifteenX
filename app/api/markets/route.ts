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
        console.log(`Found referencePrice in direct field: ${field} = ${value}`);
        return value;
      }
    }
  }

  // Check condition object deeply
  if (data.condition) {
    console.log("=== SEARCHING CONDITION OBJECT ===");
    console.log("Condition keys:", Object.keys(data.condition));
    console.log("Condition:", JSON.stringify(data.condition, null, 2));
    
    for (const field of directFields) {
      if (data.condition[field] !== undefined && data.condition[field] !== null) {
        const value = parseFloat(data.condition[field]);
        if (!isNaN(value) && value > 0) {
          console.log(`Found referencePrice in condition.${field} = ${value}`);
          return value;
        }
      }
    }

    // Check for scalar market fields in condition
    if (data.condition.scalarDenomination) {
      const value = parseFloat(data.condition.scalarDenomination);
      if (!isNaN(value) && value > 0) {
        console.log(`Found referencePrice in condition.scalarDenomination = ${value}`);
        return value;
      }
    }
  }

  // Check outcomes array
  if (Array.isArray(data.outcomes) && data.outcomes.length > 0) {
    console.log("=== SEARCHING OUTCOMES ARRAY ===");
    console.log("Outcomes:", JSON.stringify(data.outcomes, null, 2));
    
    for (let i = 0; i < data.outcomes.length; i++) {
      const outcome = data.outcomes[i];
      if (outcome && typeof outcome === 'object') {
        // Check if outcome has price or scalar value
        if (outcome.price !== undefined) {
          const value = parseFloat(outcome.price);
          if (!isNaN(value) && value > 0) {
            console.log(`Found price in outcomes[${i}].price = ${value}`);
            // For binary markets, might need to check both outcomes
          }
        }
        if (outcome.scalarValue !== undefined) {
          const value = parseFloat(outcome.scalarValue);
          if (!isNaN(value) && value > 0) {
            console.log(`Found scalarValue in outcomes[${i}].scalarValue = ${value}`);
          }
        }
      }
    }
  }

  // Check resolutionSource
  if (data.resolutionSource) {
    console.log("=== SEARCHING RESOLUTION SOURCE ===");
    console.log("ResolutionSource:", JSON.stringify(data.resolutionSource, null, 2));
    
    if (typeof data.resolutionSource === 'object') {
      for (const field of directFields) {
        if (data.resolutionSource[field] !== undefined && data.resolutionSource[field] !== null) {
          const value = parseFloat(data.resolutionSource[field]);
          if (!isNaN(value) && value > 0) {
            console.log(`Found referencePrice in resolutionSource.${field} = ${value}`);
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
      console.log(`Found referencePrice in scalarDenomination = ${value}`);
      return value;
    }
  }

  // Check metadata or additional fields
  if (data.metadata && typeof data.metadata === 'object') {
    console.log("=== SEARCHING METADATA ===");
    console.log("Metadata:", JSON.stringify(data.metadata, null, 2));
    
    for (const field of directFields) {
      if (data.metadata[field] !== undefined && data.metadata[field] !== null) {
        const value = parseFloat(data.metadata[field]);
        if (!isNaN(value) && value > 0) {
          console.log(`Found referencePrice in metadata.${field} = ${value}`);
          return value;
        }
      }
    }
  }

  // Check all top-level numeric fields that might be price-related
  console.log("=== CHECKING ALL NUMERIC FIELDS ===");
  for (const key in data) {
    if (data.hasOwnProperty(key) && typeof data[key] === 'number' && data[key] > 1000 && data[key] < 1000000) {
      // Likely a price value (between $1k and $1M for BTC)
      console.log(`Potential price field: ${key} = ${data[key]}`);
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
    console.log("=== FINDING ACTIVE 15-MINUTE BTC MARKET ===");
    const result = await findActiveMarket();

    if (!result.success || !('market' in result) || !result.market) {
      console.log("=== NO ACTIVE MARKET FOUND ===");
      console.log("Error:", 'error' in result ? result.error : "Unknown error");
      return NextResponse.json({
        success: false,
        error: ('error' in result ? result.error : "No active 15-minute BTC market found") as string,
      });
    }

    const data = result.market;
    
    console.log("=== RAW GAMMA API RESPONSE ===");
    console.log("Data Type:", typeof data);
    console.log("Object keys:", data ? Object.keys(data) : "N/A");
    console.log("Full Response:", JSON.stringify(data, null, 2));

    // Deep search for reference price in API response
    console.log("\n=== DEEP SEARCHING FOR REFERENCE PRICE ===");
    const foundReferencePrice = findReferencePrice(data);
    
    // Try fallback fields if deep search didn't find it
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
    
    // Extract timestamp from slug to fetch historical price
    let historicalPrice: number | null = null;
    let historicalSource = "none";
    const slug = data.slug || result.slug;
    
    if (slug) {
      const timestamp = extractTimestampFromSlug(slug);
      if (timestamp) {
        console.log(`\n=== FETCHING HISTORICAL PRICE FOR TIMESTAMP ===`);
        const historicalResult = await fetchHistoricalBTCPrice(timestamp);
        if (historicalResult.success && historicalResult.price) {
          historicalPrice = historicalResult.price;
          historicalSource = historicalResult.source;
        }
      }
    }
    
    // Priority: API response > Historical price > Fallback
    const finalReferencePrice = foundReferencePrice || historicalPrice || fallbackPrice;
    const priceFound = finalReferencePrice !== null;
    let priceSource = "none";
    if (foundReferencePrice) {
      priceSource = "api_deep_search";
    } else if (historicalPrice) {
      priceSource = `historical_${historicalSource}`;
    } else if (fallbackPrice) {
      priceSource = "api_fallback";
    }

    console.log(`\n=== REFERENCE PRICE RESULT ===`);
    console.log(`Found: ${priceFound}`);
    console.log(`Value: ${finalReferencePrice}`);
    console.log(`Source: ${priceSource}`);
    if (historicalPrice) {
      console.log(`Historical price (${historicalSource}): $${historicalPrice}`);
    }

    // Map Gamma API response to our format
    const market = {
      id: data.id || data.slug || result.slug,
      slug: data.slug || result.slug,
      title: data.question || data.title || "Bitcoin Up or Down",
      description: data.description || "",
      startTime: data.startDate || data.start_time || data.createdAt,
      endTime: data.endDate || data.end_time,
      resolutionSource: data.resolutionSource || data.resolution_source,
      volume: data.volume || 0,
      liquidity: data.liquidity || 0,
      outcomes: data.outcomes || [],
      condition: data.condition || {},
      referencePrice: finalReferencePrice,
      referencePriceStatus: {
        found: priceFound,
        source: priceSource,
        value: finalReferencePrice,
      },
      // Additional fields that might be in the response
      raw: data,
    };

    console.log("\n=== MAPPED MARKET DATA ===");
    console.log("Market:", JSON.stringify(market, null, 2));

    return NextResponse.json({
      success: true,
      market: market,
      markets: [market], // Return as array for consistency
    });
  } catch (error) {
    console.log("=== EXCEPTION CAUGHT ===");
    console.log("Error:", error);
    console.log("Error Message:", error instanceof Error ? error.message : "Unknown error");
    console.log("Error Stack:", error instanceof Error ? error.stack : "N/A");
    
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
