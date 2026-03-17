import { NextResponse } from "next/server";
import { getDatabase } from "@/app/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDatabase();

    const backtest = db
      .prepare("SELECT * FROM backtests WHERE id = ?")
      .get(parseInt(id)) as any;

    if (!backtest) {
      return NextResponse.json(
        { success: false, error: "Backtest not found" },
        { status: 404 }
      );
    }

    const trades = db
      .prepare(
        "SELECT * FROM backtest_trades WHERE backtest_id = ? ORDER BY timestamp ASC"
      )
      .all(parseInt(id));

    const snapshots = db
      .prepare(
        "SELECT * FROM backtest_snapshots WHERE backtest_id = ? ORDER BY timestamp ASC"
      )
      .all(parseInt(id));

    return NextResponse.json({
      success: true,
      backtest: {
        ...backtest,
        trades,
        snapshots,
      },
    });
  } catch (error) {
    console.error("Error fetching backtest:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch backtest",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

