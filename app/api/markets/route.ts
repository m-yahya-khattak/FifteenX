import { NextResponse } from "next/server";
import { findActiveMarket } from "../../lib/marketUtils";

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

    if (!result.success || !result.market) {
      console.log("=== NO ACTIVE MARKET FOUND ===");
      console.log("Error:", result.error);
      return NextResponse.json({
        success: false,
        error: result.error || "No active 15-minute BTC market found",
      });
    }

    const data = result.market;
    
    console.log("=== RAW GAMMA API RESPONSE ===");
    console.log("Data Type:", typeof data);
    console.log("Object keys:", data ? Object.keys(data) : "N/A");
    console.log("Full Response:", JSON.stringify(data, null, 2));

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
      // Try to find price to beat in various possible fields
      referencePrice: data.referencePrice || 
                     data.reference_price || 
                     data.priceToBeat || 
                     data.price_to_beat ||
                     data.startPrice ||
                     data.start_price ||
                     data.initialPrice ||
                     data.initial_price ||
                     data.condition?.referencePrice ||
                     data.condition?.priceToBeat ||
                     null,
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
