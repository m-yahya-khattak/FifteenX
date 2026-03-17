import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/app/lib/db";

// POST: Reset market maker state
export async function POST(request: NextRequest) {
  try {
    const db = getDatabase();
    const body = await request.json();
    const { marketSymbol, side, resetAll } = body;

    if (resetAll) {
      // Reset all markets
      db.prepare("DELETE FROM live_mm_performance").run();
      db.prepare("DELETE FROM live_mm_orders").run();
      db.prepare("DELETE FROM live_mm_trades").run();
      // Keep config, just reset performance/orders/trades
      
      return NextResponse.json({ 
        success: true, 
        message: "All market maker data reset successfully" 
      });
    } else if (marketSymbol && side) {
      // Reset specific market/side
      db.prepare(`
        DELETE FROM live_mm_performance 
        WHERE market_symbol = ? AND side = ?
      `).run(marketSymbol, side);
      
      db.prepare(`
        DELETE FROM live_mm_orders 
        WHERE market_symbol = ? AND side = ?
      `).run(marketSymbol, side);
      
      db.prepare(`
        DELETE FROM live_mm_trades 
        WHERE market_symbol = ? AND side = ?
      `).run(marketSymbol, side);
      
      return NextResponse.json({ 
        success: true, 
        message: `${marketSymbol} ${side} market maker data reset successfully` 
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        error: "Invalid parameters. Provide marketSymbol and side, or set resetAll to true" 
      }, { status: 400 });
    }
  } catch (error: any) {
    console.error("[Reset] Error:", error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || "Failed to reset market maker state" 
    }, { status: 500 });
  }
}
