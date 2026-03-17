import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/app/lib/db";

// Calculate 15-minute window start timestamp
function getWindowStart(timestamp: number): number {
  return Math.floor(timestamp / 900000) * 900000;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const assetId = searchParams.get("asset_id");
    const windowStartParam = searchParams.get("window_start");
    const durationMinutes = parseInt(searchParams.get("duration_minutes") || "15");

    if (!assetId) {
      return NextResponse.json(
        { success: false, error: "asset_id is required" },
        { status: 400 }
      );
    }

    const db = getDatabase();
    let windowStart: number;

    if (windowStartParam) {
      // Use provided window start
      windowStart = parseInt(windowStartParam);
    } else {
      // Use most recent complete 15-minute window
      const now = Date.now();
      windowStart = getWindowStart(now) - 900000; // Previous window (completed)
    }

    // Calculate end time (windowStart + duration)
    const windowEnd = windowStart + (durationMinutes * 60 * 1000);

    // Fetch all messages for this asset in the time window
    const messages = db
      .prepare(
        `SELECT event_type, timestamp, message_data
         FROM historical_orderbook
         WHERE asset_id = ? AND timestamp >= ? AND timestamp < ?
         ORDER BY timestamp ASC`
      )
      .all(assetId, windowStart, windowEnd)
      .map((row: any) => ({
        event_type: row.event_type,
        timestamp: row.timestamp,
        ...JSON.parse(row.message_data),
      }));

    // Group by window for multiple windows if duration > 15 minutes
    const windows: { [key: number]: any[] } = {};
    messages.forEach((msg) => {
      const msgWindow = getWindowStart(msg.timestamp);
      if (!windows[msgWindow]) {
        windows[msgWindow] = [];
      }
      windows[msgWindow].push(msg);
    });

    return NextResponse.json({
      success: true,
      data: messages,
      windows: Object.keys(windows).map(Number).sort(),
      windowStart,
      windowEnd,
      count: messages.length,
    });
  } catch (error: any) {
    console.error("Error fetching historical data:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

