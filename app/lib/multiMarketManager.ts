/**
 * Multi-Market Manager
 * 
 * Manages multiple 15-minute markets (BTC, ETH, SOL, XRP) simultaneously
 * Tracks positions per market, handles expiration, and settlement
 */

export interface MarketInfo {
  symbol: string; // "BTC", "ETH", "SOL", "XRP"
  marketId: string;
  slug: string;
  title: string;
  assetIds: string[]; // [yesAssetId, noAssetId]
  startTime: number; // timestamp in ms
  endTime: number; // timestamp in ms
  referencePrice: number | null;
  isActive: boolean;
  isExpired: boolean;
  outcome?: "YES" | "NO" | null; // Settlement outcome
}

export interface MarketPosition {
  marketId: string;
  symbol: string;
  inventory: number; // Net position (positive = long YES, negative = short YES)
  realizedPnL: number;
  unrealizedPnL: number;
  trades: number;
  isSettled: boolean;
  settlementPnL?: number;
}

export class MultiMarketManager {
  private markets: Map<string, MarketInfo> = new Map();
  private positions: Map<string, MarketPosition> = new Map();
  private symbols: string[] = ["BTC", "ETH", "SOL", "XRP"];
  
  constructor() {
    // Initialize positions for each symbol
    this.symbols.forEach(symbol => {
      this.positions.set(symbol, {
        marketId: "",
        symbol,
        inventory: 0,
        realizedPnL: 0,
        unrealizedPnL: 0,
        trades: 0,
        isSettled: false,
      });
    });
  }

  /**
   * Update market information
   */
  updateMarket(market: MarketInfo): void {
    this.markets.set(market.symbol, market);
    
    // Update position marketId if it changed (new market started)
    const position = this.positions.get(market.symbol);
    if (position && position.marketId !== market.marketId) {
      // New market started - check if we need to settle old position
      if (position.marketId && position.inventory !== 0) {
        // Old market expired, settle position
        this.settleMarket(position.marketId, market.symbol, market.referencePrice);
      }
      
      // Reset position for new market
      position.marketId = market.marketId;
      position.inventory = 0;
      position.realizedPnL = 0;
      position.unrealizedPnL = 0;
      position.trades = 0;
      position.isSettled = false;
      position.settlementPnL = undefined;
    }
  }

  /**
   * Get all active markets
   */
  getActiveMarkets(): MarketInfo[] {
    return Array.from(this.markets.values()).filter(m => m.isActive && !m.isExpired);
  }

  /**
   * Get all markets (including expired)
   */
  getAllMarkets(): MarketInfo[] {
    return Array.from(this.markets.values());
  }

  /**
   * Get market by symbol
   */
  getMarket(symbol: string): MarketInfo | undefined {
    return this.markets.get(symbol);
  }

  /**
   * Get position for a market
   */
  getPosition(symbol: string): MarketPosition | undefined {
    return this.positions.get(symbol);
  }

  /**
   * Get all positions
   */
  getAllPositions(): MarketPosition[] {
    return Array.from(this.positions.values());
  }

  /**
   * Update position for a market
   */
  updatePosition(symbol: string, updates: Partial<MarketPosition>): void {
    const position = this.positions.get(symbol);
    if (position) {
      Object.assign(position, updates);
    }
  }

  /**
   * Settle an expired market
   * Calculates final P&L based on outcome
   */
  settleMarket(marketId: string, symbol: string, finalPrice: number | null): void {
    const market = this.markets.get(symbol);
    const position = this.positions.get(symbol);
    
    if (!market || !position || position.marketId !== marketId) return;
    if (position.isSettled) return; // Already settled
    
    // Determine outcome based on final price vs reference price
    if (market.referencePrice !== null && finalPrice !== null) {
      const outcome = finalPrice >= market.referencePrice ? "YES" : "NO";
      market.outcome = outcome;
      
      // Calculate settlement P&L
      // If we're long YES (positive inventory) and YES wins, we profit
      // If we're short YES (negative inventory) and NO wins, we profit
      let settlementPnL = 0;
      
      if (position.inventory > 0) {
        // Long YES position
        settlementPnL = outcome === "YES" 
          ? position.inventory * 1.0 // Win: get $1 per share
          : 0; // Lose: get $0 per share
      } else if (position.inventory < 0) {
        // Short YES position (equivalent to long NO)
        settlementPnL = outcome === "NO"
          ? Math.abs(position.inventory) * 1.0 // Win: get $1 per share
          : 0; // Lose: get $0 per share
      }
      
      // Subtract cost basis (what we paid for the position)
      // For simplicity, we'll use average entry price from realized PnL
      // In practice, you'd track entry prices per trade
      const costBasis = Math.abs(position.inventory) * 0.5; // Rough estimate
      settlementPnL -= costBasis;
      
      position.settlementPnL = settlementPnL;
      position.realizedPnL += settlementPnL;
      position.isSettled = true;
    }
    
    market.isExpired = true;
    market.isActive = false;
  }

  /**
   * Check for market transitions (new markets starting)
   */
  checkMarketTransitions(): Array<{ symbol: string; oldMarketId: string; newMarketId: string }> {
    const transitions: Array<{ symbol: string; oldMarketId: string; newMarketId: string }> = [];
    
    this.symbols.forEach(symbol => {
      const position = this.positions.get(symbol);
      const market = this.markets.get(symbol);
      
      if (position && market && position.marketId && position.marketId !== market.marketId) {
        transitions.push({
          symbol,
          oldMarketId: position.marketId,
          newMarketId: market.marketId,
        });
      }
    });
    
    return transitions;
  }

  /**
   * Get total performance across all markets
   */
  getTotalPerformance(): {
    totalPnL: number;
    totalRealizedPnL: number;
    totalUnrealizedPnL: number;
    totalTrades: number;
    marketsWon: number;
    marketsLost: number;
    marketsActive: number;
  } {
    let totalPnL = 0;
    let totalRealizedPnL = 0;
    let totalUnrealizedPnL = 0;
    let totalTrades = 0;
    let marketsWon = 0;
    let marketsLost = 0;
    let marketsActive = 0;
    
    this.positions.forEach(position => {
      totalRealizedPnL += position.realizedPnL;
      totalUnrealizedPnL += position.unrealizedPnL;
      totalTrades += position.trades;
      
      if (position.isSettled && position.settlementPnL !== undefined) {
        if (position.settlementPnL > 0) {
          marketsWon++;
        } else if (position.settlementPnL < 0) {
          marketsLost++;
        }
      } else {
        marketsActive++;
      }
    });
    
    totalPnL = totalRealizedPnL + totalUnrealizedPnL;
    
    return {
      totalPnL,
      totalRealizedPnL,
      totalUnrealizedPnL,
      totalTrades,
      marketsWon,
      marketsLost,
      marketsActive,
    };
  }

  /**
   * Reset all positions (for testing)
   */
  reset(): void {
    this.positions.forEach(position => {
      position.inventory = 0;
      position.realizedPnL = 0;
      position.unrealizedPnL = 0;
      position.trades = 0;
      position.isSettled = false;
      position.settlementPnL = undefined;
    });
  }
}
