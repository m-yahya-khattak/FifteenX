import { NextResponse } from "next/server";
import { getDatabase } from "@/app/lib/db";

const DEFAULT_USER_ID = "default";

export async function GET() {
  try {
    const db = getDatabase();
    const positions = db
      .prepare(
        `SELECT 
          position_id as id,
          market_id,
          market_title,
          side,
          asset_id,
          entry_price,
          quantity,
          entry_value,
          timestamp,
          end_time
         FROM virtual_positions 
         WHERE user_id = ? 
         ORDER BY timestamp DESC`
      )
      .all(DEFAULT_USER_ID);

    return NextResponse.json({ success: true, positions });
  } catch (error) {
    console.error("Error fetching positions:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch positions",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { positions } = await request.json();
    const db = getDatabase();

    const deleteStmt = db.prepare("DELETE FROM virtual_positions WHERE user_id = ?");
    const insertStmt = db.prepare(
      `INSERT INTO virtual_positions 
       (user_id, position_id, market_id, market_title, side, asset_id, 
        entry_price, quantity, entry_value, timestamp, end_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, position_id) DO UPDATE SET
         entry_price = excluded.entry_price,
         quantity = excluded.quantity,
         entry_value = excluded.entry_value`
    );

    const savePositions = db.transaction((positionsList: any[]) => {
      deleteStmt.run(DEFAULT_USER_ID);
      for (const pos of positionsList) {
        insertStmt.run(
          DEFAULT_USER_ID,
          pos.id,
          pos.marketId,
          pos.marketTitle,
          pos.side,
          pos.assetId,
          pos.entryPrice,
          pos.quantity,
          pos.entryValue,
          pos.timestamp,
          pos.endTime || null
        );
      }
    });

    savePositions(positions);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving positions:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to save positions",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

