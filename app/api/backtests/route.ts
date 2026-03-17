import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/app/lib/db";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "20");

    const db = getDatabase();
    const backtests = db
      .prepare(
        `SELECT id, timestamp, duration_minutes, initial_capital, final_balance,
         total_pnl, max_drawdown_percent, risk_of_loss, win_rate, total_trades
         FROM backtests
         ORDER BY timestamp DESC
         LIMIT ?`
      )
      .all(limit)
      .map((row: any) => ({
        id: row.id,
        timestamp: row.timestamp,
        durationMinutes: row.duration_minutes,
        initialCapital: row.initial_capital,
        finalBalance: row.final_balance,
        totalPnL: row.total_pnl,
        maxDrawdownPercent: row.max_drawdown_percent,
        riskOfLoss: row.risk_of_loss,
        winRate: row.win_rate,
        totalTrades: row.total_trades,
      }));

    return NextResponse.json({ success: true, backtests });
  } catch (error: any) {
    console.error("Error fetching backtests:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch backtests",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    const db = getDatabase();
    
    const result = db
      .prepare(
        `INSERT INTO backtests (
          timestamp, duration_minutes, initial_capital, final_balance,
          total_pnl, realized_pnl, total_trades, buy_trades, sell_trades,
          spread_captured, max_drawdown, max_drawdown_percent, sharpe_ratio,
          win_rate, risk_of_loss, config_spread_bps, config_order_size,
          config_max_position, config_rebalance_interval
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.timestamp || Date.now(),
        data.durationMinutes || 0,
        data.initialCapital || 0,
        data.finalBalance || 0,
        data.totalPnL || 0,
        data.realizedPnL || 0,
        data.totalTrades || 0,
        data.buyTrades || 0,
        data.sellTrades || 0,
        data.spreadCaptured || 0,
        data.maxDrawdown || 0,
        data.maxDrawdownPercent || 0,
        data.sharpeRatio || null,
        data.winRate || 0,
        data.riskOfLoss || 0,
        data.configSpreadBps || 0,
        data.configOrderSize || 0,
        data.configMaxPosition || 0,
        data.configRebalanceInterval || 0
      );

    // Insert trades if provided
    if (data.trades && data.trades.length > 0) {
      const insertTrade = db.prepare(
        `INSERT INTO backtest_trades (backtest_id, trade_id, side, price, size, pnl, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      const insertTrades = db.transaction((trades: any[]) => {
        for (const trade of trades) {
          insertTrade.run(
            result.lastInsertRowid,
            trade.tradeId || trade.id,
            trade.side,
            trade.price,
            trade.size,
            trade.pnl || null,
            trade.timestamp
          );
        }
      });

      insertTrades(data.trades);
    }

    // Insert snapshots if provided
    if (data.snapshots && data.snapshots.length > 0) {
      const insertSnapshot = db.prepare(
        `INSERT INTO backtest_snapshots (backtest_id, timestamp, balance, inventory, unrealized_pnl, realized_pnl, total_pnl)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      const insertSnapshots = db.transaction((snapshots: any[]) => {
        for (const snapshot of snapshots) {
          insertSnapshot.run(
            result.lastInsertRowid,
            snapshot.timestamp,
            snapshot.balance,
            snapshot.inventory,
            snapshot.unrealizedPnL || 0,
            snapshot.realizedPnL || 0,
            snapshot.totalPnL || 0
          );
        }
      });

      insertSnapshots(data.snapshots);
    }

    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (error: any) {
    console.error("Error saving backtest:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to save backtest",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");
    
    const db = getDatabase();
    
    if (id) {
      // Delete specific backtest
      db.prepare("DELETE FROM backtests WHERE id = ?").run(parseInt(id));
    } else {
      // Delete all backtests
      db.prepare("DELETE FROM backtests").run();
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting backtests:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to delete backtests",
      },
      { status: 500 }
    );
  }
}
