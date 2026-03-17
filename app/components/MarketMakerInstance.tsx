"use client";

import { useEffect, useRef } from "react";
import { useMarketMaker } from "../hooks/useMarketMaker";
import { MultiMarketMakerManager } from "../lib/multiMarketMakerManager";

interface MarketMakerInstanceProps {
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
  manager: MultiMarketMakerManager;
  onUpdate?: () => void;
}

/**
 * Component that manages market making for a specific market and side
 * This allows separate market making for each market (BTC, ETH, SOL, XRP)
 * and each side (YES/NO) within each market
 * 
 * NOTE: Uses "backtest" mode to avoid creating live WebSocket connections.
 * WebSocket connections are only created for the selected market visualization.
 */
export default function MarketMakerInstance({
  symbol,
  side,
  assetId,
  marketId,
  config,
  manager,
  onUpdate,
}: MarketMakerInstanceProps) {
  // Get market maker instance for this specific asset
  // Using "backtest" mode to avoid creating live WebSocket connections
  // Each instance will use backtest data instead of live feeds
  const {
    orders,
    trades,
    performance,
    setConfig: setMMConfig,
    startBacktest,
    isBacktesting,
  } = useMarketMaker([assetId], "backtest");
  
  // Sync config
  useEffect(() => {
    setMMConfig(prev => ({
      ...prev,
      spreadBps: config.spreadBps,
      orderSize: config.orderSize,
      maxPosition: config.maxPosition,
      enabled: config.enabled,
      initialCapital: 10,
    }));
  }, [config.spreadBps, config.orderSize, config.maxPosition, config.enabled, setMMConfig]);

  // Auto-start continuous backtesting when enabled and assetId is available
  useEffect(() => {
    if (config.enabled && assetId && !isBacktesting) {
      // Start backtest for 15 minutes at 1x speed
      startBacktest(15, 1).catch(console.error);
    }
  }, [config.enabled, assetId, isBacktesting, startBacktest]);
  
  // Restart backtest when it completes (continuous backtesting)
  useEffect(() => {
    if (config.enabled && assetId && !isBacktesting && trades.length > 0) {
      // Backtest just completed, restart it after a short delay
      const timer = setTimeout(() => {
        startBacktest(15, 1).catch(console.error);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [config.enabled, assetId, isBacktesting, trades.length, startBacktest]);

  
  // Track previous values to avoid unnecessary updates
  const prevOrdersRef = useRef<string>(JSON.stringify(orders));
  const prevTradesRef = useRef<string>(JSON.stringify(trades));
  const prevPerformanceRef = useRef<string>(JSON.stringify(performance));
  const onUpdateRef = useRef(onUpdate);
  
  // Update ref when callback changes
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);
  
  // Sync orders to manager - only update when orders actually change
  useEffect(() => {
    const ordersStr = JSON.stringify(orders);
    if (ordersStr === prevOrdersRef.current) return;
    prevOrdersRef.current = ordersStr;
    
    let hasChanges = false;
    orders.forEach(order => {
      // Check if order already exists
      const existing = manager.getInstance(symbol, side, assetId, marketId).orders.find(o => o.id === order.id);
      if (!existing) {
        manager.addOrder(symbol, side, {
          ...order,
          assetId,
        });
        hasChanges = true;
      } else {
        const needsUpdate = existing.filled !== order.filled || existing.filledSize !== order.filledSize;
        if (needsUpdate) {
          manager.updateOrder(symbol, side, order.id, {
            filled: order.filled,
            filledSize: order.filledSize,
          });
          hasChanges = true;
        }
      }
    });
    
    // Only call onUpdate if there were actual changes
    if (hasChanges) {
      onUpdateRef.current?.();
    }
  }, [orders, symbol, side, assetId, marketId, manager]);
  
  // Sync trades to manager - only update when trades actually change
  useEffect(() => {
    const tradesStr = JSON.stringify(trades);
    if (tradesStr === prevTradesRef.current) return;
    prevTradesRef.current = tradesStr;
    
    let hasChanges = false;
    trades.forEach(trade => {
      const existing = manager.getInstance(symbol, side, assetId, marketId).trades.find(t => t.id === trade.id);
      if (!existing) {
        manager.addTrade(symbol, side, {
          ...trade,
          assetId,
        });
        hasChanges = true;
      }
    });
    
    // Only call onUpdate if there were actual changes
    if (hasChanges) {
      onUpdateRef.current?.();
    }
  }, [trades, symbol, side, assetId, marketId, manager]);
  
  // Sync performance to manager - only update when performance actually changes
  useEffect(() => {
    const perfStr = JSON.stringify(performance);
    if (perfStr === prevPerformanceRef.current) return;
    prevPerformanceRef.current = perfStr;
    
    manager.updatePerformance(symbol, side, {
      totalPnL: performance.totalPnL,
      realizedPnL: performance.realizedPnL,
      unrealizedPnL: performance.unrealizedPnL,
      totalTrades: performance.totalTrades,
      inventory: performance.inventory,
      balance: performance.balance,
    });
    
    // Debounce onUpdate to avoid excessive calls
    const timeoutId = setTimeout(() => {
      onUpdateRef.current?.();
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [performance, symbol, side, manager]);
  
  // This component doesn't render anything - it just manages the market maker instance
  return null;
}
