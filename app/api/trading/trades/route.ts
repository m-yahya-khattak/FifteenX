import { NextResponse } from "next/server";
import { getDatabase } from "@/app/lib/db";

const DEFAULT_USER_ID = "default";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "100");

    const db = getDatabase();
    const trades = db
      .prepare(
        `SELECT 
          trade_id as id,
          market_id,
          market_title,
          side,
          type,
          price,
          quantity,
          value,
          pnl,
          timestamp
         FROM virtual_trades 
         WHERE user_id = ? 
         ORDER BY timestamp DESC 
         LIMIT ?`
      )
      .all(DEFAULT_USER_ID, limit);

    return NextResponse.json({ success: true, trades });
  } catch (error) {
    console.error("Error fetching trades:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch trades",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { trades } = await request.json();
    const db = getDatabase();

    const insertStmt = db.prepare(
      `INSERT INTO virtual_trades 
       (user_id, trade_id, market_id, market_title, side, type, 
        price, quantity, value, pnl, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, trade_id) DO NOTHING`
    );

    const saveTrades = db.transaction((tradesList: any[]) => {
      for (const trade of tradesList) {
        insertStmt.run(
          DEFAULT_USER_ID,
          trade.id,
          trade.marketId,
          trade.marketTitle,
          trade.side,
          trade.type,
          trade.price,
          trade.quantity,
          trade.value,
          trade.pnl || null,
          trade.timestamp
        );
      }
    });

    saveTrades(trades);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving trades:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to save trades",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const db = getDatabase();
    db.prepare("DELETE FROM virtual_trades WHERE user_id = ?").run(DEFAULT_USER_ID);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting trades:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete trades",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

