import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/app/lib/db";

const DEFAULT_USER_ID = "default";

// GET: Load live market maker state
export async function GET(request: NextRequest) {
  try {
    const db = getDatabase();

    // Load performance
    const performance = db
      .prepare(
        `SELECT market_symbol, side, asset_id, market_id, balance, inventory,
         realized_pnl, unrealized_pnl, total_pnl, total_trades, updated_at
         FROM live_mm_performance
         ORDER BY market_symbol, side`
      )
      .all()
      .map((row: any) => ({
        marketSymbol: row.market_symbol,
        side: row.side,
        assetId: row.asset_id,
        marketId: row.market_id,
        balance: row.balance,
        inventory: row.inventory,
        realizedPnL: row.realized_pnl,
        unrealizedPnL: row.unrealized_pnl,
        totalPnL: row.total_pnl,
        totalTrades: row.total_trades,
        updatedAt: row.updated_at,
      }));

    // Load active orders (not filled)
    const orders = db
      .prepare(
        `SELECT order_id, market_symbol, side, asset_id, market_id, order_side,
         price, size, filled_size, is_filled, timestamp, created_at
         FROM live_mm_orders
         WHERE is_filled = 0
         ORDER BY created_at DESC`
      )
      .all()
      .map((row: any) => ({
        id: row.order_id,
        marketSymbol: row.market_symbol,
        side: row.side, // YES/NO
        assetId: row.asset_id,
        marketId: row.market_id,
        orderSide: row.order_side, // BUY/SELL
        price: row.price,
        size: row.size,
        filledSize: row.filled_size,
        filled: row.is_filled === 1,
        timestamp: row.timestamp,
        createdAt: row.created_at,
      }));

    // Load recent trades (last 48 hours)
    const trades = db
      .prepare(
        `SELECT trade_id, order_id, market_symbol, side, asset_id, market_id,
         trade_side, price, size, pnl, timestamp, created_at
         FROM live_mm_trades
         WHERE timestamp > ? - (48 * 60 * 60 * 1000)
         ORDER BY timestamp DESC
         LIMIT 500`
      )
      .all(Date.now())
      .map((row: any) => ({
        id: row.trade_id,
        orderId: row.order_id,
        marketSymbol: row.market_symbol,
        side: row.side, // YES/NO
        assetId: row.asset_id,
        marketId: row.market_id,
        tradeSide: row.trade_side, // BUY/SELL
        price: row.price,
        size: row.size,
        pnl: row.pnl,
        timestamp: row.timestamp,
        createdAt: row.created_at,
      }));

    // Load config
    const config = db
      .prepare(
        `SELECT market_symbol, side, spread_bps, order_size, max_position, initial_capital, enabled, updated_at
         FROM mm_config
         ORDER BY market_symbol, side`
      )
      .all()
      .map((row: any) => ({
        marketSymbol: row.market_symbol,
        side: row.side,
        spreadBps: row.spread_bps,
        orderSize: row.order_size,
        maxPosition: row.max_position,
        initialCapital: row.initial_capital ?? 100, // Default to 100 if null
        enabled: row.enabled === 1,
        updatedAt: row.updated_at,
      }));

    return NextResponse.json({
      success: true,
      performance,
      orders,
      trades,
      config,
    });
  } catch (error: any) {
    console.error("Error loading MM state:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to load MM state",
      },
      { status: 500 }
    );
  }
}

// POST: Save live market maker state
export async function POST(request: Request) {
  try {
    const data = await request.json();
    const db = getDatabase();

    // Save performance
    if (data.performance && Array.isArray(data.performance)) {
      const perfStmt = db.prepare(
        `INSERT OR REPLACE INTO live_mm_performance 
         (market_symbol, side, asset_id, market_id, balance, inventory,
          realized_pnl, unrealized_pnl, total_pnl, total_trades, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      const savePerformance = db.transaction((perfArray: any[]) => {
        for (const perf of perfArray) {
          perfStmt.run(
            perf.marketSymbol,
            perf.side,
            perf.assetId,
            perf.marketId,
            perf.balance,
            perf.inventory,
            perf.realizedPnL,
            perf.unrealizedPnL,
            perf.totalPnL,
            perf.totalTrades,
            Date.now()
          );
        }
      });

      savePerformance(data.performance);
    }

    // Save orders
    if (data.orders && Array.isArray(data.orders)) {
      const orderStmt = db.prepare(
        `INSERT OR REPLACE INTO live_mm_orders
         (order_id, market_symbol, side, asset_id, market_id, order_side,
          price, size, filled_size, is_filled, timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      const saveOrders = db.transaction((orderArray: any[]) => {
        for (const order of orderArray) {
          orderStmt.run(
            order.id,
            order.marketSymbol,
            order.side, // YES/NO
            order.assetId,
            order.marketId,
            order.orderSide || order.side, // BUY/SELL (fallback to side if orderSide not provided)
            order.price,
            order.size,
            order.filledSize || 0,
            order.filled ? 1 : 0,
            order.timestamp,
            order.createdAt || Date.now()
          );
        }
      });

      saveOrders(data.orders);
    }

    // Save trades (only new ones, check for duplicates)
    if (data.trades && Array.isArray(data.trades)) {
      const tradeStmt = db.prepare(
        `INSERT OR IGNORE INTO live_mm_trades
         (trade_id, order_id, market_symbol, side, asset_id, market_id,
          trade_side, price, size, pnl, timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      const saveTrades = db.transaction((tradeArray: any[]) => {
        for (const trade of tradeArray) {
          tradeStmt.run(
            trade.id,
            trade.orderId,
            trade.marketSymbol,
            trade.side, // YES/NO
            trade.assetId,
            trade.marketId,
            trade.tradeSide || trade.side, // BUY/SELL (fallback to side if tradeSide not provided)
            trade.price,
            trade.size,
            trade.pnl || null,
            trade.timestamp,
            trade.createdAt || Date.now()
          );
        }
      });

      saveTrades(data.trades);
    }

    // Save config
    if (data.config && Array.isArray(data.config)) {
      const configStmt = db.prepare(
        `INSERT OR REPLACE INTO mm_config
         (market_symbol, side, spread_bps, order_size, max_position, initial_capital, enabled, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );

      const saveConfig = db.transaction((configArray: any[]) => {
        for (const cfg of configArray) {
          configStmt.run(
            cfg.marketSymbol,
            cfg.side,
            cfg.spreadBps,
            cfg.orderSize,
            cfg.maxPosition,
            cfg.initialCapital ?? 100, // Default to 100 if not provided
            cfg.enabled ? 1 : 0,
            Date.now()
          );
        }
      });

      saveConfig(data.config);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error saving MM state:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to save MM state",
      },
      { status: 500 }
    );
  }
}

// DELETE: Clean up old data
export async function DELETE(request: NextRequest) {
  try {
    const db = getDatabase();
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get("action");

    if (action === "cleanup") {
      // Delete filled orders older than 1 day
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      db.prepare("DELETE FROM live_mm_orders WHERE is_filled = 1 AND created_at < ?").run(oneDayAgo);

      // Delete trades older than 7 days
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      db.prepare("DELETE FROM live_mm_trades WHERE timestamp < ?").run(sevenDaysAgo);

      return NextResponse.json({ success: true, message: "Cleanup completed" });
    } else if (action === "reset") {
      // Reset all MM state (for testing)
      db.prepare("DELETE FROM live_mm_performance").run();
      db.prepare("DELETE FROM live_mm_orders").run();
      db.prepare("DELETE FROM live_mm_trades").run();
      // Keep config - don't delete user settings

      return NextResponse.json({ success: true, message: "MM state reset" });
    }

    return NextResponse.json(
      { success: false, error: "Invalid action" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Error in DELETE:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to delete",
      },
      { status: 500 }
    );
  }
}
