"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useMarketMaker } from "./useMarketMaker";
import { MultiMarketMakerManager, MarketMakerInstance } from "../lib/multiMarketMakerManager";

/**
 * Hook to manage separate market maker instances for each market and side
 * Each market (BTC, ETH, SOL, XRP) has two sides (YES/NO)
 * Market making is done separately for each
 */
export function useMultiMarketMaker(markets: Map<string, {
  symbol: string;
  assetIds: string[];
  id: string;
}>) {
  const managerRef = useRef<MultiMarketMakerManager>(new MultiMarketMakerManager());
  const [instances, setInstances] = useState<Map<string, MarketMakerInstance>>(new Map());
  const [configs, setConfigs] = useState<Map<string, MarketMakerInstance["config"]>>(new Map());

  // Create/update instances when markets change
  useEffect(() => {
    const newInstances = new Map<string, MarketMakerInstance>();
    
    markets.forEach((market) => {
      const { symbol, assetIds, id } = market;
      
      if (assetIds && assetIds.length >= 2) {
        const yesAssetId = assetIds[0];
        const noAssetId = assetIds[1];
        
        // YES side
        const yesInstance = managerRef.current.getInstance(symbol, "YES", yesAssetId, id);
        newInstances.set(`${symbol}-YES`, yesInstance);
        
        // NO side
        const noInstance = managerRef.current.getInstance(symbol, "NO", noAssetId, id);
        newInstances.set(`${symbol}-NO`, noInstance);
      }
    });
    
    setInstances(newInstances);
  }, [markets]);

  // Update config
  const updateConfig = useCallback((symbol: string, side: "YES" | "NO", config: Partial<MarketMakerInstance["config"]>) => {
    managerRef.current.updateConfig(symbol, side, config);
    const key = `${symbol}-${side}`;
    const instance = instances.get(key);
    if (instance) {
      instance.config = { ...instance.config, ...config };
      setInstances(new Map(instances));
    }
  }, [instances]);

  // Get config
  const getConfig = useCallback((symbol: string, side: "YES" | "NO") => {
    return managerRef.current.getConfig(symbol, side);
  }, []);

  // Get all orders across all instances
  const getAllOrders = useCallback(() => {
    const allOrders: Array<MarketMakerInstance["orders"][0] & { marketSymbol: string; marketSide: "YES" | "NO" }> = [];
    instances.forEach((instance, key) => {
      const [symbol, side] = key.split("-") as [string, "YES" | "NO"];
      instance.orders.forEach(order => {
        allOrders.push({
          ...order,
          marketSymbol: symbol,
          marketSide: side,
        });
      });
    });
    return allOrders;
  }, [instances]);

  // Get all trades across all instances
  const getAllTrades = useCallback(() => {
    const allTrades: Array<MarketMakerInstance["trades"][0] & { marketSymbol: string; marketSide: "YES" | "NO" }> = [];
    instances.forEach((instance, key) => {
      const [symbol, side] = key.split("-") as [string, "YES" | "NO"];
      instance.trades.forEach(trade => {
        allTrades.push({
          ...trade,
          marketSymbol: symbol,
          marketSide: side,
        });
      });
    });
    return allTrades.sort((a, b) => b.timestamp - a.timestamp);
  }, [instances]);

  // Get total performance
  const getTotalPerformance = useCallback(() => {
    return managerRef.current.getTotalPerformance();
  }, []);

  // Get instance for a market/side
  const getInstance = useCallback((symbol: string, side: "YES" | "NO") => {
    return instances.get(`${symbol}-${side}`);
  }, [instances]);

  return {
    instances,
    updateConfig,
    getConfig,
    getAllOrders,
    getAllTrades,
    getTotalPerformance,
    getInstance,
    manager: managerRef.current,
  };
}
