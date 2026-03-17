import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/app/lib/db";

// Calculate 15-minute window start timestamp
function getWindowStart(timestamp: number): number {
  // Round down to nearest 15-minute interval (900000 ms = 15 minutes)
  return Math.floor(timestamp / 900000) * 900000;
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.asset_id || !data.market || !data.event_type || !data.timestamp) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const timestamp = parseInt(data.timestamp);
    const windowStart = getWindowStart(timestamp);

    // Insert the captured message
    db.prepare(
      `INSERT INTO historical_orderbook 
       (window_start, asset_id, market, event_type, timestamp, message_data)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      windowStart,
      data.asset_id,
      data.market,
      data.event_type,
      timestamp,
      JSON.stringify(data.message)
    );

    // Clean up data older than 15 minutes (keep only current window)
    const cutoffTime = windowStart - 900000; // One window before current
    db.prepare(
      `DELETE FROM historical_orderbook WHERE window_start < ?`
    ).run(cutoffTime);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error capturing historical data:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

