import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const apiKey = process.env.POLYMARKET_API_KEY;
    const apiUrl = process.env.POLYMARKET_API_URL || "https://clob.polymarket.com";
    const { id: marketId } = await params;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "API key not configured" },
        { status: 500 }
      );
    }

    // Fetch current BTC price for comparison
    // This might come from Chainlink or another price source
    // For now, try to get it from the market data or a separate endpoint
    
    // Option 1: Get from market endpoint
    const marketEndpoint = `${apiUrl}/markets/${marketId}`;
    
    // Option 2: Get BTC price from a price feed
    // const btcPriceEndpoint = `${apiUrl}/prices/btc-usd`;
    // Or use Chainlink: https://data.chain.link/streams/btc-usd

    const response = await fetch(marketEndpoint, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      // If market endpoint fails, try to get BTC price from Chainlink
      try {
        const chainlinkResponse = await fetch(
          "https://data.chain.link/api/streams/btc-usd",
          { cache: "no-store" }
        );
        
        if (chainlinkResponse.ok) {
          const chainlinkData = await chainlinkResponse.json();
          const btcPrice = chainlinkData?.data?.price || chainlinkData?.price;
          
          if (btcPrice) {
            return NextResponse.json({
              success: true,
              currentPrice: parseFloat(btcPrice),
              source: "chainlink",
              timestamp: new Date().toISOString(),
            });
          }
        }
      } catch (chainlinkError) {
        // Fall through to error response
      }

      return NextResponse.json(
        {
          success: false,
          error: `Failed to fetch price: ${response.status}`,
        },
        { status: response.status }
      );
    }

    const marketData = await response.json();
    
    // Extract current price from market data
    // Adjust based on actual API response
    const currentPrice = 
      marketData.current_price || 
      marketData.currentPrice || 
      marketData.btc_price ||
      marketData.price;

    return NextResponse.json({
      success: true,
      currentPrice: currentPrice ? parseFloat(currentPrice) : null,
      marketData: marketData,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch price",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}



