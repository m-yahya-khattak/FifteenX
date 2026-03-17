import { NextResponse } from "next/server";
import { findAllActiveMarkets, extractTimestampFromSlug } from "../../../lib/marketUtils";

/**
 * Fetch all active 15-minute markets (BTC, ETH, SOL, XRP)
 */
export async function GET(request: Request) {
  try {
    const results = await findAllActiveMarkets();
    const markets = [];
    
    for (const { symbol, result } of results) {
      if (!result.success || !result.market) {
        continue; // Skip if market not found
      }
      
      const data = result.market;
      const slug = data.slug || result.slug;
      
      // Calculate exact 15-minute boundary times from slug timestamp
      let calculatedStartTime: string | undefined;
      let calculatedEndTime: string | undefined;
      
      if (slug) {
        const timestamp = extractTimestampFromSlug(slug);
        if (timestamp) {
          calculatedStartTime = new Date(timestamp * 1000).toISOString();
          calculatedEndTime = new Date((timestamp + 900) * 1000).toISOString();
        }
      }
      
      const startTime = calculatedStartTime || data.startDate || data.start_time || data.createdAt;
      const endTime = calculatedEndTime || data.endDate || data.end_time;
      
      // Reference price - not needed, removed API call
      // Websocket data provides real-time prices
      let referencePrice: number | null = null;
      
      // Extract asset IDs
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
      
      // Check if market is active (not expired)
      const now = Date.now();
      const endTimeMs = endTime ? new Date(endTime).getTime() : now + 900000; // Default 15 min from now
      const isActive = endTimeMs > now;
      const isExpired = endTimeMs <= now;
      
      markets.push({
        symbol,
        id: data.id || slug,
        slug,
        title: data.question || data.title || `${symbol} Up or Down`,
        description: data.description || "",
        startTime: calculatedStartTime || data.startDate || data.start_time || data.createdAt,
        endTime: calculatedEndTime || data.endDate || data.end_time,
        startTimeMs: startTime ? new Date(startTime).getTime() : now,
        endTimeMs,
        assetIds,
        referencePrice,
        isActive,
        isExpired,
        volume: data.volume || 0,
        liquidity: data.liquidity || 0,
        raw: data,
      });
    }
    
    return NextResponse.json({
      success: true,
      markets,
      count: markets.length,
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
