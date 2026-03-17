/**
 * Multi-Market Maker Manager
 * 
 * Manages separate market maker instances for each market (BTC, ETH, SOL, XRP)
 * and each side (YES/NO) within each market.
 * 
 * Each market has two tokens:
 * - YES/UP token (assetIds[0])
 * - NO/DOWN token (assetIds[1])
 * 
 * Market making is done separately for each token.
 */

export interface MarketMakerInstance {
  symbol: string; // "BTC", "ETH", "SOL", "XRP"
  side: "YES" | "NO";
  assetId: string;
  marketId: string;
  config: {
    spreadBps: number;
    orderSize: number;
    maxPosition: number;
    enabled: boolean;
  };
  orders: Array<{
    id: string;
    side: "BUY" | "SELL";
    price: number;
    size: number;
    assetId: string;
    timestamp: number;
    filled?: boolean;
    filledSize?: number;
  }>;
  trades: Array<{
    id: string;
    orderId: string;
    side: "BUY" | "SELL";
    price: number;
    size: number;
    assetId: string;
    timestamp: number;
    pnl?: number;
  }>;
  performance: {
    totalPnL: number;
    realizedPnL: number;
    unrealizedPnL: number;
    totalTrades: number;
    inventory: number;
    balance: number;
  };
}

export interface MarketMakerConfig {
  [symbol: string]: {
    YES: {
      spreadBps: number;
      orderSize: number;
      maxPosition: number;
      initialCapital: number;
      enabled: boolean;
    };
    NO: {
      spreadBps: number;
      orderSize: number;
      maxPosition: number;
      initialCapital: number;
      enabled: boolean;
    };
  };
}

export class MultiMarketMakerManager {
  private instances: Map<string, MarketMakerInstance> = new Map();
  private defaultConfig: MarketMakerConfig = {
    BTC: {
      YES: { spreadBps: 50, orderSize: 1, maxPosition: 1, initialCapital: 100, enabled: true },
      NO: { spreadBps: 50, orderSize: 1, maxPosition: 1, initialCapital: 100, enabled: true },
    },
    ETH: {
      YES: { spreadBps: 50, orderSize: 1, maxPosition: 1, initialCapital: 100, enabled: true },
      NO: { spreadBps: 50, orderSize: 1, maxPosition: 1, initialCapital: 100, enabled: true },
    },
    SOL: {
      YES: { spreadBps: 50, orderSize: 1, maxPosition: 1, initialCapital: 100, enabled: true },
      NO: { spreadBps: 50, orderSize: 1, maxPosition: 1, initialCapital: 100, enabled: true },
    },
    XRP: {
      YES: { spreadBps: 50, orderSize: 1, maxPosition: 1, initialCapital: 100, enabled: true },
      NO: { spreadBps: 50, orderSize: 1, maxPosition: 1, initialCapital: 100, enabled: true },
    },
  };

  /**
   * Get or create market maker instance for a market and side
   */
  getInstance(symbol: string, side: "YES" | "NO", assetId: string, marketId: string): MarketMakerInstance {
    const key = `${symbol}-${side}`;
    
    if (!this.instances.has(key)) {
      const config = this.defaultConfig[symbol]?.[side] || {
        spreadBps: 50,
        orderSize: 1,
        maxPosition: 1,
        initialCapital: 100,
        enabled: true,
      };
      
      this.instances.set(key, {
        symbol,
        side,
        assetId,
        marketId,
        config,
        orders: [],
        trades: [],
        performance: {
          totalPnL: 0,
          realizedPnL: 0,
          unrealizedPnL: 0,
          totalTrades: 0,
          inventory: 0,
          balance: config.initialCapital, // Use configured initial capital
        },
      });
    }
    
    const instance = this.instances.get(key)!;
    
    // Update assetId and marketId if they changed (new market started)
    if (instance.assetId !== assetId || instance.marketId !== marketId) {
      // Reset for new market
      instance.assetId = assetId;
      instance.marketId = marketId;
      instance.orders = [];
      instance.trades = [];
      instance.performance = {
        totalPnL: 0,
        realizedPnL: 0,
        unrealizedPnL: 0,
        totalTrades: 0,
        inventory: 0,
        balance: instance.config.initialCapital, // Reset to configured initial capital
      };
    }
    
    return instance;
  }

  /**
   * Get all instances for a market
   */
  getMarketInstances(symbol: string): MarketMakerInstance[] {
    return [
      this.instances.get(`${symbol}-YES`),
      this.instances.get(`${symbol}-NO`),
    ].filter(Boolean) as MarketMakerInstance[];
  }

  /**
   * Get all instances
   */
  getAllInstances(): MarketMakerInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Update configuration for a market/side
   */
  updateConfig(symbol: string, side: "YES" | "NO", config: Partial<MarketMakerInstance["config"]>): void {
    const key = `${symbol}-${side}`;
    const instance = this.instances.get(key);
    if (instance) {
      instance.config = { ...instance.config, ...config };
    } else {
      // Update default config
      if (!this.defaultConfig[symbol]) {
        this.defaultConfig[symbol] = { 
          YES: { spreadBps: 50, orderSize: 1, maxPosition: 1, initialCapital: 100, enabled: true }, 
          NO: { spreadBps: 50, orderSize: 1, maxPosition: 1, initialCapital: 100, enabled: true } 
        };
      }
      this.defaultConfig[symbol][side] = { ...this.defaultConfig[symbol][side], ...config };
    }
  }

  /**
   * Get configuration for a market/side
   */
  getConfig(symbol: string, side: "YES" | "NO"): MarketMakerInstance["config"] {
    const key = `${symbol}-${side}`;
    const instance = this.instances.get(key);
    if (instance) {
      return instance.config;
    }
    return this.defaultConfig[symbol]?.[side] || {
      spreadBps: 50,
      orderSize: 1,
      maxPosition: 1,
      initialCapital: 100,
      enabled: true,
    };
  }

  /**
   * Add order to instance
   */
  addOrder(symbol: string, side: "YES" | "NO", order: MarketMakerInstance["orders"][0]): void {
    const key = `${symbol}-${side}`;
    const instance = this.instances.get(key);
    if (instance) {
      instance.orders.push(order);
    }
  }

  /**
   * Update order in instance
   */
  updateOrder(symbol: string, side: "YES" | "NO", orderId: string, updates: Partial<MarketMakerInstance["orders"][0]>): void {
    const key = `${symbol}-${side}`;
    const instance = this.instances.get(key);
    if (instance) {
      const order = instance.orders.find(o => o.id === orderId);
      if (order) {
        Object.assign(order, updates);
      }
    }
  }

  /**
   * Add trade to instance
   */
  addTrade(symbol: string, side: "YES" | "NO", trade: MarketMakerInstance["trades"][0]): void {
    const key = `${symbol}-${side}`;
    const instance = this.instances.get(key);
    if (instance) {
      instance.trades.push(trade);
      instance.performance.totalTrades++;
      if (trade.pnl !== undefined) {
        instance.performance.realizedPnL += trade.pnl;
        instance.performance.totalPnL += trade.pnl;
      }
    }
  }

  /**
   * Update performance for instance
   */
  updatePerformance(symbol: string, side: "YES" | "NO", updates: Partial<MarketMakerInstance["performance"]>): void {
    const key = `${symbol}-${side}`;
    const instance = this.instances.get(key);
    if (instance) {
      Object.assign(instance.performance, updates);
    }
  }

  /**
   * Get total performance across all instances
   */
  getTotalPerformance(): {
    totalPnL: number;
    totalRealizedPnL: number;
    totalUnrealizedPnL: number;
    totalTrades: number;
    totalOrders: number;
  } {
    let totalPnL = 0;
    let totalRealizedPnL = 0;
    let totalUnrealizedPnL = 0;
    let totalTrades = 0;
    let totalOrders = 0;
    
    this.instances.forEach(instance => {
      totalPnL += instance.performance.totalPnL;
      totalRealizedPnL += instance.performance.realizedPnL;
      totalUnrealizedPnL += instance.performance.unrealizedPnL;
      totalTrades += instance.performance.totalTrades;
      totalOrders += instance.orders.filter(o => !o.filled).length;
    });
    
    return {
      totalPnL,
      totalRealizedPnL,
      totalUnrealizedPnL,
      totalTrades,
      totalOrders,
    };
  }

  /**
   * Reset all instances
   */
  reset(): void {
    this.instances.forEach(instance => {
      instance.orders = [];
      instance.trades = [];
      instance.performance = {
        totalPnL: 0,
        realizedPnL: 0,
        unrealizedPnL: 0,
        totalTrades: 0,
        inventory: 0,
        balance: instance.config.initialCapital, // Reset to configured initial capital
      };
    });
  }

  /**
   * Export state for saving to database
   */
  exportState(): {
    performance: Array<{
      marketSymbol: string;
      side: "YES" | "NO";
      assetId: string;
      marketId: string;
      balance: number;
      inventory: number;
      realizedPnL: number;
      unrealizedPnL: number;
      totalPnL: number;
      totalTrades: number;
    }>;
    orders: Array<{
      id: string;
      marketSymbol: string;
      side: "YES" | "NO";
      assetId: string;
      marketId: string;
      orderSide: "BUY" | "SELL";
      price: number;
      size: number;
      filledSize: number;
      filled: boolean;
      timestamp: number;
      createdAt: number;
    }>;
    trades: Array<{
      id: string;
      orderId: string;
      marketSymbol: string;
      side: "YES" | "NO";
      assetId: string;
      marketId: string;
      tradeSide: "BUY" | "SELL";
      price: number;
      size: number;
      pnl?: number;
      timestamp: number;
      createdAt: number;
    }>;
    config: Array<{
      marketSymbol: string;
      side: "YES" | "NO";
      spreadBps: number;
      orderSize: number;
      maxPosition: number;
      enabled: boolean;
    }>;
  } {
    const performance: any[] = [];
    const orders: any[] = [];
    const trades: any[] = [];
    const config: any[] = [];

    this.instances.forEach(instance => {
      // Export performance
      performance.push({
        marketSymbol: instance.symbol,
        side: instance.side,
        assetId: instance.assetId,
        marketId: instance.marketId,
        balance: instance.performance.balance,
        inventory: instance.performance.inventory,
        realizedPnL: instance.performance.realizedPnL,
        unrealizedPnL: instance.performance.unrealizedPnL,
        totalPnL: instance.performance.totalPnL,
        totalTrades: instance.performance.totalTrades,
      });

      // Export active orders
      instance.orders.forEach(order => {
        orders.push({
          id: order.id,
          marketSymbol: instance.symbol,
          side: instance.side,
          assetId: order.assetId,
          marketId: instance.marketId,
          orderSide: order.side, // BUY/SELL
          price: order.price,
          size: order.size,
          filledSize: order.filledSize || 0,
          filled: order.filled || false,
          timestamp: order.timestamp,
          createdAt: order.timestamp, // Use timestamp as createdAt if not available
        });
      });

      // Export recent trades (last 100 per instance)
      instance.trades.slice(-100).forEach(trade => {
        trades.push({
          id: trade.id,
          orderId: trade.orderId,
          marketSymbol: instance.symbol,
          side: instance.side,
          assetId: trade.assetId,
          marketId: instance.marketId,
          tradeSide: trade.side, // BUY/SELL
          price: trade.price,
          size: trade.size,
          pnl: trade.pnl,
          timestamp: trade.timestamp,
          createdAt: trade.timestamp,
        });
      });

      // Export config
      config.push({
        marketSymbol: instance.symbol,
        side: instance.side,
        spreadBps: instance.config.spreadBps,
        orderSize: instance.config.orderSize,
        maxPosition: instance.config.maxPosition,
        initialCapital: instance.config.initialCapital,
        enabled: instance.config.enabled,
      });
    });

    return { performance, orders, trades, config };
  }

  /**
   * Import state from database
   */
  importState(state: {
    performance?: Array<{
      marketSymbol: string;
      side: "YES" | "NO";
      assetId: string;
      marketId: string;
      balance: number;
      inventory: number;
      realizedPnL: number;
      unrealizedPnL: number;
      totalPnL: number;
      totalTrades: number;
    }>;
    orders?: Array<{
      id: string;
      marketSymbol: string;
      side: "YES" | "NO";
      assetId: string;
      marketId: string;
      orderSide: "BUY" | "SELL";
      price: number;
      size: number;
      filledSize: number;
      filled: boolean;
      timestamp: number;
    }>;
    trades?: Array<{
      id: string;
      orderId: string;
      marketSymbol: string;
      side: "YES" | "NO";
      assetId: string;
      marketId: string;
      tradeSide: "BUY" | "SELL";
      price: number;
      size: number;
      pnl?: number;
      timestamp: number;
    }>;
    config?: Array<{
      marketSymbol: string;
      side: "YES" | "NO";
      spreadBps: number;
      orderSize: number;
      maxPosition: number;
      enabled: boolean;
    }>;
  }): void {
    // Import config first (so instances are created with correct config)
    if (state.config) {
      state.config.forEach(cfg => {
        this.updateConfig(cfg.marketSymbol, cfg.side, {
          spreadBps: cfg.spreadBps,
          orderSize: cfg.orderSize,
          maxPosition: cfg.maxPosition,
          initialCapital: cfg.initialCapital ?? 100, // Default to 100 if not provided
          enabled: cfg.enabled,
        });
      });
    }

    // Import performance
    if (state.performance) {
      state.performance.forEach(perf => {
        const instance = this.getInstance(
          perf.marketSymbol,
          perf.side,
          perf.assetId,
          perf.marketId
        );
        // Calculate locked balance from unfilled BUY orders
        const unfilledBuyOrders = instance.orders.filter(o => o.side === "BUY" && !o.filled);
        let lockedBalance = 0;
        unfilledBuyOrders.forEach(order => {
          const remainingSize = order.size - (order.filledSize || 0);
          lockedBalance += order.price * remainingSize;
        });
        
        instance.performance = {
          totalPnL: perf.totalPnL,
          realizedPnL: perf.realizedPnL,
          unrealizedPnL: perf.unrealizedPnL,
          totalTrades: perf.totalTrades,
          inventory: perf.inventory,
          balance: perf.balance,
          lockedBalance: lockedBalance,
          availableBalance: perf.balance - lockedBalance,
        };
      });
    }

    // Import orders (only active ones)
    if (state.orders) {
      state.orders.forEach(order => {
        if (!order.filled) {
          const instance = this.getInstance(
            order.marketSymbol,
            order.side,
            order.assetId,
            order.marketId
          );
          // Check if order already exists
          if (!instance.orders.find(o => o.id === order.id)) {
            instance.orders.push({
              id: order.id,
              side: order.orderSide,
              price: order.price,
              size: order.size,
              assetId: order.assetId,
              timestamp: order.timestamp,
              filled: order.filled,
              filledSize: order.filledSize,
            });
          }
        }
      });
    }

    // Import trades
    if (state.trades) {
      state.trades.forEach(trade => {
        const instance = this.getInstance(
          trade.marketSymbol,
          trade.side,
          trade.assetId,
          trade.marketId
        );
        // Check if trade already exists
        if (!instance.trades.find(t => t.id === trade.id)) {
          instance.trades.push({
            id: trade.id,
            orderId: trade.orderId,
            side: trade.tradeSide,
            price: trade.price,
            size: trade.size,
            assetId: trade.assetId,
            timestamp: trade.timestamp,
            pnl: trade.pnl,
          });
        }
      });
    }
  }
}
