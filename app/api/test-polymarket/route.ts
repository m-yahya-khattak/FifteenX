import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Get API key from environment variables
    const apiKey = process.env.POLYMARKET_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "POLYMARKET_API_KEY not found in environment variables",
          message: "Please add POLYMARKET_API_KEY to your .env.local file",
        },
        { status: 500 }
      );
    }

    // Polymarket CLOB API endpoint
    // Try the CLOB API first - this is the main REST API for market data
    const apiUrl = process.env.POLYMARKET_API_URL || "https://clob.polymarket.com";
    
    // Try different possible endpoints - Polymarket CLOB API might use different paths
    // Option 1: Try /markets endpoint
    let testEndpoint = `${apiUrl}/markets`;
    
    // If that doesn't work, try these alternatives:
    // - `${apiUrl}/clob/markets`
    // - `${apiUrl}/v1/markets`
    // - `${apiUrl}/markets?limit=10`
    
    const response = await fetch(testEndpoint, {
      method: "GET",
      headers: {
        // Polymarket might use different auth methods - try these:
        "Authorization": `Bearer ${apiKey}`,
        // OR: "X-API-KEY": apiKey,
        // OR: "Authorization": `ApiKey ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          success: false,
          error: `API request failed: ${response.status} ${response.statusText}`,
          details: errorText,
          endpoint: testEndpoint,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      message: "Polymarket API connection successful!",
      data: data,
      endpoint: testEndpoint,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to connect to Polymarket API",
        message: error instanceof Error ? error.message : "Unknown error",
        details: error instanceof Error ? error.stack : String(error),
      },
      { status: 500 }
    );
  }
}

