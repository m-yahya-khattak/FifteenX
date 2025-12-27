import { NextResponse } from "next/server";

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

    // Search for 15-minute BTC markets
    // Try different possible endpoints
    const searchParams = new URL(request.url).searchParams;
    const query = searchParams.get("query") || "btc";
    const limit = searchParams.get("limit") || "10";

    // Use Gamma API endpoint for specific market
    // Format: https://gamma-api.polymarket.com/markets/slug/{slug}
    const marketSlug = "btc-updown-15m-1766755800";
    const gammaEndpoint = `https://gamma-api.polymarket.com/markets/slug/${marketSlug}`;

    console.log("=== FETCHING MARKET FROM GAMMA API ===");
    console.log("Endpoint:", gammaEndpoint);

    const response = await fetch(gammaEndpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      // Add cache control for real-time data
      cache: "no-store",
    });

    console.log("Response Status:", response.status);
    console.log("Response OK:", response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("=== ERROR RESPONSE ===");
      console.log("Status:", response.status);
      console.log("Error Text:", errorText);
      return NextResponse.json(
        {
          success: false,
          error: `Failed to fetch markets: ${response.status}`,
          details: errorText,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    console.log("=== RAW GAMMA API RESPONSE ===");
    console.log("Data Type:", typeof data);
    console.log("Object keys:", data ? Object.keys(data) : "N/A");
    console.log("Full Response:", JSON.stringify(data, null, 2));

    if (!data) {
      console.log("\n=== NO DATA RETURNED ===");
      return NextResponse.json({
        success: false,
        error: "No data returned from API",
      });
    }

    // Map Gamma API response to our format
    const market = {
      id: data.id || data.slug || marketSlug,
      slug: data.slug || marketSlug,
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
