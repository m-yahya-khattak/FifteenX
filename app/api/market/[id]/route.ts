import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const apiKey = process.env.POLYMARKET_API_KEY;
    const apiUrl = process.env.POLYMARKET_API_URL || "https://clob.polymarket.com";
    const marketId = params.id;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "API key not configured" },
        { status: 500 }
      );
    }

    // Use Gamma API endpoint
    // Format: https://gamma-api.polymarket.com/markets/slug/{slug}
    const gammaEndpoint = `https://gamma-api.polymarket.com/markets/slug/${marketId}`;

    console.log("=== FETCHING MARKET DETAILS FROM GAMMA API ===");
    console.log("Market ID/Slug:", marketId);
    console.log("Endpoint:", gammaEndpoint);

    const response = await fetch(gammaEndpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          success: false,
          error: `Failed to fetch market: ${response.status}`,
          details: errorText,
        },
        { status: response.status }
      );
    }

    const marketData = await response.json();

    console.log("=== GAMMA API MARKET DETAILS ===");
    console.log("Raw Response:", JSON.stringify(marketData, null, 2));

    // Extract relevant data from Gamma API response
    const market = {
      id: marketData.id || marketData.slug || marketId,
      slug: marketData.slug || marketId,
      title: marketData.question || marketData.title || "Bitcoin Up or Down",
      description: marketData.description || "",
      startTime: marketData.startDate || marketData.start_time || marketData.createdAt,
      endTime: marketData.endDate || marketData.end_time,
      resolutionSource: marketData.resolutionSource || marketData.resolution_source,
      volume: marketData.volume || 0,
      liquidity: marketData.liquidity || 0,
      outcomes: marketData.outcomes || [],
      condition: marketData.condition || {},
      // Try to find price to beat in various possible fields
      referencePrice: marketData.referencePrice || 
                     marketData.reference_price || 
                     marketData.priceToBeat || 
                     marketData.price_to_beat ||
                     marketData.startPrice ||
                     marketData.start_price ||
                     marketData.initialPrice ||
                     marketData.initial_price ||
                     marketData.condition?.referencePrice ||
                     marketData.condition?.priceToBeat ||
                     null,
      // Price data might be in outcomes
      yesPrice: marketData.outcomes?.[0]?.price || marketData.yes_price || marketData.yesPrice,
      noPrice: marketData.outcomes?.[1]?.price || marketData.no_price || marketData.noPrice,
      status: marketData.status || marketData.state || "active",
    };

    console.log("=== MAPPED MARKET ===");
    console.log("Market:", JSON.stringify(market, null, 2));

    return NextResponse.json({
      success: true,
      market,
      raw: marketData, // Include raw data for debugging
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch market details",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
