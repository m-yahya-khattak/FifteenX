"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useMarketMaker } from "../hooks/useMarketMaker";
import { useMultiMarketDiscovery } from "../hooks/useMultiMarketDiscovery";
import { useSharedCLOBWebSocket } from "../hooks/useSharedCLOBWebSocket";
import { useMultiMarketMaker } from "../hooks/useMultiMarketMaker";
import Link from "next/link";
import PnLChart from "../components/PnLChart";
import MarketMakerVisualization from "../components/MarketMakerVisualization";
import MarketMakerInstance from "../components/MarketMakerInstance";
import { MultiMarketManager, MarketInfo, MarketPosition } from "../lib/multiMarketManager";
import { MultiMarketMakerManager } from "../lib/multiMarketMakerManager";

interface MarketData {
  symbol: string;
  id: string;
  slug: string;
  title: string;
  assetIds: string[];
  startTimeMs: number;
  endTimeMs: number;
  referencePrice: number | null;
  isActive: boolean;
  isExpired: boolean;
}

export default function MarketMakerPage() {
  // Multi-market manager (for positions/settlement)
  const marketManagerRef = useRef<MultiMarketManager>(new MultiMarketManager());
  
  // Multi-market maker manager (for separate MM instances per market/side)
  const mmManagerRef = useRef<MultiMarketMakerManager>(new MultiMarketMakerManager());
  
  // State for all markets
  const [markets, setMarkets] = useState<Map<string, MarketData>>(new Map());
  const [positions, setPositions] = useState<Map<string, MarketPosition>>(new Map());
  const [marketTransitions, setMarketTransitions] = useState<Array<{
    symbol: string;
    timestamp: number;
    oldMarketId: string;
    newMarketId: string;
  }>>([]);
  
  // Selected market for detailed view
  const [selectedMarket, setSelectedMarket] = useState<string>("BTC");
  const [selectedSide, setSelectedSide] = useState<"YES" | "NO">("YES");
  
  // Force update trigger for MM instances
  const [mmUpdateTrigger, setMmUpdateTrigger] = useState(0);
  
  // Overall performance
  const [totalPerformance, setTotalPerformance] = useState({
    totalPnL: 0,
    totalRealizedPnL: 0,
    totalUnrealizedPnL: 0,
    totalTrades: 0,
    marketsWon: 0,
    marketsLost: 0,
    marketsActive: 4,
    totalOrders: 0,
  });
  
  // Update total performance from MM manager (real-time updates)
  useEffect(() => {
    const mmPerf = mmManagerRef.current.getTotalPerformance();
    const marketPerf = marketManagerRef.current.getTotalPerformance();
    setTotalPerformance({
      totalPnL: mmPerf.totalPnL,
      totalRealizedPnL: mmPerf.totalRealizedPnL,
      totalUnrealizedPnL: mmPerf.totalUnrealizedPnL,
      totalTrades: mmPerf.totalTrades,
      marketsWon: marketPerf.marketsWon,
      marketsLost: marketPerf.marketsLost,
      marketsActive: marketPerf.marketsActive,
      totalOrders: mmPerf.totalOrders,
    });
  }, [mmUpdateTrigger]);
  
  // Backtest state
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [backtestSpeed, setBacktestSpeed] = useState(1);
  const backtestIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // WebSocket-based market discovery
  const { markets: discoveredMarkets, isDiscovering, isConnected: wsConnected } = useMultiMarketDiscovery();

  // Process discovered markets from WebSocket
  useEffect(() => {
    if (discoveredMarkets.length === 0) return;
    
    // Check if markets actually changed by comparing market IDs
    const currentMarketIds = Array.from(markets.values()).map((m: MarketData) => m.id).sort().join(',');
    const newMarketIds = discoveredMarkets.map((m) => m.marketId).sort().join(',');
    
    // Only update if markets actually changed
    if (currentMarketIds === newMarketIds) {
      // Markets haven't changed, but update positions/performance in case they did
      const allPositions = marketManagerRef.current.getAllPositions();
      const positionsMap = new Map<string, MarketPosition>();
      allPositions.forEach(pos => {
        positionsMap.set(pos.symbol, pos);
      });
      setPositions(positionsMap);
      
        const perf = marketManagerRef.current.getTotalPerformance();
        const mmPerf = mmManagerRef.current.getTotalPerformance();
        setTotalPerformance({
          ...perf,
          totalOrders: mmPerf.totalOrders,
        });
      return;
    }
    
    setMarkets((prevMarkets) => {
      const marketsMap = new Map<string, MarketData>();
      const transitions: Array<{ symbol: string; timestamp: number; oldMarketId: string; newMarketId: string }> = [];
      
      discoveredMarkets.forEach((market) => {
        const symbol = market.symbol;
        const oldMarket = prevMarkets.get(symbol);
        
        // Check for market transition
        if (oldMarket && oldMarket.id !== market.marketId) {
          transitions.push({
            symbol,
            timestamp: Date.now(),
            oldMarketId: oldMarket.id,
            newMarketId: market.marketId,
          });
          
          // Settle old market
          const manager = marketManagerRef.current;
          const position = manager.getPosition(symbol);
          if (position && position.inventory !== 0) {
            // Settle based on outcome
            manager.settleMarket(oldMarket.id, symbol, market.referencePrice);
          }

          // Reset MM instance for new market (this will reset orders/trades/performance)
          // The instance will be recreated with new marketId when getInstance is called
          const mmInstanceYES = mmManagerRef.current.getInstance(symbol, "YES", market.assetIds?.[0] || "", market.marketId);
          const mmInstanceNO = mmManagerRef.current.getInstance(symbol, "NO", market.assetIds?.[1] || "", market.marketId);
          
          // If market ID changed, reset the instance (getInstance already handles this, but ensure it)
          if (mmInstanceYES.marketId !== market.marketId) {
            mmInstanceYES.marketId = market.marketId;
            mmInstanceYES.assetId = market.assetIds?.[0] || "";
            mmInstanceYES.orders = [];
            mmInstanceYES.trades = [];
          const yesConfig = mmManagerRef.current.getConfig(symbol, "YES");
          mmInstanceYES.performance = {
            totalPnL: 0,
            realizedPnL: 0,
            unrealizedPnL: 0,
            totalTrades: 0,
            inventory: 0,
            balance: yesConfig.initialCapital, // Use configured initial capital
          };
          }
          if (mmInstanceNO.marketId !== market.marketId) {
            mmInstanceNO.marketId = market.marketId;
            mmInstanceNO.assetId = market.assetIds?.[1] || "";
            mmInstanceNO.orders = [];
            mmInstanceNO.trades = [];
          const noConfig = mmManagerRef.current.getConfig(symbol, "NO");
          mmInstanceNO.performance = {
            totalPnL: 0,
            realizedPnL: 0,
            unrealizedPnL: 0,
            totalTrades: 0,
            inventory: 0,
            balance: noConfig.initialCapital, // Use configured initial capital
          };
          }

          // Save state after market transition
          saveStateRef.current?.();
        }
        
        marketsMap.set(symbol, {
          symbol: market.symbol,
          id: market.marketId,
          slug: market.slug,
          title: market.title,
          assetIds: market.assetIds || [],
          startTimeMs: market.startTimeMs,
          endTimeMs: market.endTimeMs,
          referencePrice: market.referencePrice,
          isActive: market.isActive,
          isExpired: market.isExpired,
        });
        
        // Update market manager
        marketManagerRef.current.updateMarket({
          symbol,
          marketId: market.marketId,
          slug: market.slug,
          title: market.title,
          assetIds: market.assetIds || [],
          startTime: market.startTimeMs,
          endTime: market.endTimeMs,
          referencePrice: market.referencePrice,
          isActive: market.isActive,
          isExpired: market.isExpired,
        });
      });
      
      return marketsMap;
    });
    
    // Update positions and performance outside of setMarkets to avoid nested state updates
    const allPositions = marketManagerRef.current.getAllPositions();
    const positionsMap = new Map<string, MarketPosition>();
    allPositions.forEach(pos => {
      positionsMap.set(pos.symbol, pos);
    });
    setPositions(positionsMap);
    
        const perf = marketManagerRef.current.getTotalPerformance();
        const mmPerf = mmManagerRef.current.getTotalPerformance();
        setTotalPerformance({
          ...perf,
          totalOrders: mmPerf.totalOrders,
        });
    
    // Handle transitions
    const transitions: Array<{ symbol: string; timestamp: number; oldMarketId: string; newMarketId: string }> = [];
    discoveredMarkets.forEach((market) => {
      const oldMarket = markets.get(market.symbol);
      if (oldMarket && oldMarket.id !== market.marketId) {
        transitions.push({
          symbol: market.symbol,
          timestamp: Date.now(),
          oldMarketId: oldMarket.id,
          newMarketId: market.marketId,
        });
      }
    });
    if (transitions.length > 0) {
      setMarketTransitions(prev => [...prev, ...transitions].slice(-20));
    }
  }, [discoveredMarkets]); // Only depend on discoveredMarkets, not markets

  // Get selected market data
  const selectedMarketData = markets.get(selectedMarket);
  const selectedAssetId = selectedMarketData?.assetIds?.[selectedSide === "YES" ? 0 : 1] || null;
  const selectedAssetIds = selectedMarketData?.assetIds || null;
  
  // Collect ALL asset IDs from all markets for shared WebSocket subscription
  const allAssetIds = useMemo(() => {
    const assetIds = new Set<string>();
    markets.forEach(market => {
      if (market.assetIds) {
        market.assetIds.forEach(id => assetIds.add(id));
      }
    });
    return Array.from(assetIds);
  }, [markets]);
  
  // Use shared WebSocket connection for all assets (single connection, filtered on frontend)
  // Pass selectedAssetId to filter orderbook for the selected asset
  const { orderBook: liveOrderBook, isConnected: orderBookConnected } = useSharedCLOBWebSocket(
    allAssetIds.length > 0 ? allAssetIds : null,
    selectedAssetId
  );
  
  // Get market maker instance for selected market/side
  const selectedInstance = mmManagerRef.current.getInstance(
    selectedMarket,
    selectedSide,
    selectedAssetId || "",
    selectedMarketData?.id || ""
  );
  
  // Get config for selected market/side
  const config = mmManagerRef.current.getConfig(selectedMarket, selectedSide);

  // Use live market maker for the selected market/side to actually place orders
  // This is separate from the MarketMakerInstance components which run in backtest mode
  // Pass both asset IDs (YES and NO) for dual-asset market making
  const liveMarketMakerAssetIds = selectedMarketData?.assetIds && selectedMarketData.assetIds.length >= 2
    ? selectedMarketData.assetIds
    : null;
  const {
    orders: liveOrders,
    trades: liveTrades,
    performance: livePerformance,
    setConfig: setLiveMMConfig,
    actualSpreadBps,
    performanceHistory: livePerformanceHistory,
    performanceHistoryVersion,
    reset: resetLiveMM,
  } = useMarketMaker(
    liveMarketMakerAssetIds, 
    "live",
    selectedMarketData?.startTimeMs,
    selectedMarketData?.endTimeMs
  );

  // Sync live market maker config with manager config
  useEffect(() => {
    if (config) {
      setLiveMMConfig(prev => ({
        ...prev,
        spreadBps: config.spreadBps,
        orderSize: config.orderSize,
        maxPosition: config.maxPosition,
        initialCapital: config.initialCapital ?? 100, // Sync initial capital
        enabled: config.enabled,
        rebalanceInterval: 5000, // Rebalance every 5 seconds
      }));
    }
  }, [config?.spreadBps, config?.orderSize, config?.maxPosition, config?.initialCapital, config?.enabled, setLiveMMConfig]);

  // Sync live orders and performance to the manager's selected instance (real-time)
  useEffect(() => {
    let hasChanges = false;
    
    // Sync orders
    if (liveOrders.length !== selectedInstance.orders.length ||
        liveOrders.some((order, idx) => order.id !== selectedInstance.orders[idx]?.id || 
                                      order.filled !== selectedInstance.orders[idx]?.filled)) {
      selectedInstance.orders = [...liveOrders];
      hasChanges = true;
    }
    
    // Sync performance (check all fields for changes)
    if (livePerformance.totalPnL !== selectedInstance.performance.totalPnL ||
        livePerformance.realizedPnL !== selectedInstance.performance.realizedPnL ||
        livePerformance.unrealizedPnL !== selectedInstance.performance.unrealizedPnL ||
        livePerformance.balance !== selectedInstance.performance.balance ||
        livePerformance.inventory !== selectedInstance.performance.inventory ||
        livePerformance.totalTrades !== selectedInstance.performance.totalTrades) {
      selectedInstance.performance = { ...livePerformance };
      hasChanges = true;
    }
    
    if (hasChanges) {
      setMmUpdateTrigger(prev => prev + 1);
    }
  }, [liveOrders, livePerformance, selectedInstance]);

  // Real-time performance update trigger - update when livePerformance changes
  useEffect(() => {
    // Trigger update when live performance changes (for real-time UI updates)
    if (livePerformance.totalPnL !== undefined || livePerformance.balance !== undefined) {
      setMmUpdateTrigger(prev => prev + 1);
    }
  }, [livePerformance.totalPnL, livePerformance.balance, livePerformance.inventory, livePerformance.realizedPnL, livePerformance.unrealizedPnL]);

  // Sync live trades to the manager's selected instance
  useEffect(() => {
    if (liveTrades.length > 0) {
      // Only add new trades that aren't already in the instance
      const existingTradeIds = new Set(selectedInstance.trades.map(t => t.id));
      const newTrades = liveTrades.filter(t => !existingTradeIds.has(t.id));
      if (newTrades.length > 0) {
        selectedInstance.trades = [...selectedInstance.trades, ...newTrades];
        setMmUpdateTrigger(prev => prev + 1);
      }
    }
  }, [liveTrades, selectedInstance]);

  // Save state function (used for immediate saves on critical events)
  const lastSaveRef = useRef<number>(0);
  const saveStateRef = useRef<(() => Promise<void>) | null>(null);
  saveStateRef.current = async () => {
    try {
      const state = mmManagerRef.current.exportState();
      await fetch("/api/market-maker/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      lastSaveRef.current = Date.now();
    } catch (error) {
      console.error("[MM State] Failed to save:", error);
    }
  };

  // Load MM state from database on mount
  useEffect(() => {
    const loadState = async () => {
      try {
        const response = await fetch("/api/market-maker/state");
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            mmManagerRef.current.importState(data);
            setMmUpdateTrigger(prev => prev + 1);
            
            // Sync loaded performance to live MM if it matches current market/side
            if (selectedMarket && selectedSide && data.performance) {
              const loadedPerf = data.performance.find(
                (p: any) => p.marketSymbol === selectedMarket && p.side === selectedSide
              );
              if (loadedPerf) {
                // Calculate locked balance from orders
                const loadedOrders = data.orders?.filter(
                  (o: any) => o.marketSymbol === selectedMarket && o.side === selectedSide && !o.filled
                ) || [];
                let lockedBalance = 0;
                loadedOrders.forEach((order: any) => {
                  if (order.orderSide === "BUY") {
                    const remainingSize = order.size - (order.filledSize || 0);
                    lockedBalance += order.price * remainingSize;
                  }
                });
                
                // Update live MM config and performance
                setLiveMMConfig(prev => ({
                  ...prev,
                  initialCapital: loadedPerf.balance, // Use loaded balance as initial capital
                }));
              }
            }
            
            console.log("[MM State] Loaded from database", {
              performance: data.performance?.length || 0,
              orders: data.orders?.length || 0,
              trades: data.trades?.length || 0,
              config: data.config?.length || 0,
            });
          }
        }
      } catch (error) {
        console.error("[MM State] Failed to load state:", error);
      }
    };

    loadState();
  }, []); // Only on mount

  // Auto-save MM state periodically (every 10 seconds)
  useEffect(() => {
    const autoSave = async () => {
      const now = Date.now();
      // Don't save too frequently (min 5 seconds between saves)
      if (now - lastSaveRef.current < 5000) return;
      
      try {
        const state = mmManagerRef.current.exportState();
        const response = await fetch("/api/market-maker/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(state),
        });

        if (response.ok) {
          lastSaveRef.current = now;
          console.log("[MM State] Auto-saved", {
            performance: state.performance.length,
            orders: state.orders.length,
            trades: state.trades.length,
            config: state.config.length,
          });
        }
      } catch (error) {
        console.error("[MM State] Failed to auto-save:", error);
      }
    };

    const interval = setInterval(autoSave, 10000); // Every 10 seconds
    return () => clearInterval(interval);
  }, [mmUpdateTrigger]); // Re-run when state changes

  // Save on trade execution
  useEffect(() => {
    if (liveTrades.length > 0) {
      saveStateRef.current?.();
    }
  }, [liveTrades.length]);

  // Save on config change
  useEffect(() => {
    if (config) {
      saveStateRef.current?.();
    }
  }, [config?.spreadBps, config?.orderSize, config?.maxPosition, config?.enabled]);
  
  // Get orders and trades from manager
  const allOrders = useMemo(() => {
    return mmManagerRef.current.getAllInstances()
      .flatMap(instance => instance.orders.map(order => ({
        ...order,
        marketSymbol: instance.symbol,
        marketSide: instance.side,
      })))
      .filter(order => !order.filled);
  }, [mmUpdateTrigger]);
  
  const allTrades = useMemo(() => {
    return mmManagerRef.current.getAllInstances()
      .flatMap(instance => instance.trades.map(trade => ({
        ...trade,
        marketSymbol: instance.symbol,
        marketSide: instance.side,
      })))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [mmUpdateTrigger]);
  
  // Get orders/trades for selected market/side
  // Use live orders if available, otherwise fall back to instance orders
  const orders = useMemo(() => {
    if (liveOrders.length > 0 && selectedMarketData?.assetIds) {
      // Filter live orders to only show orders for the selected side (YES or NO)
      // YES = assetIds[0], NO = assetIds[1]
      const targetAssetId = selectedSide === "YES" 
        ? selectedMarketData.assetIds[0]
        : selectedMarketData.assetIds[1];
      return liveOrders.filter(order => order.assetId === targetAssetId);
    }
    return selectedInstance.orders;
  }, [liveOrders, selectedMarketData?.assetIds, selectedSide, selectedInstance.orders]);
  
  const trades = useMemo(() => {
    if (liveTrades.length > 0 && selectedMarketData?.assetIds) {
      // Filter live trades to only show trades for the selected side
      const targetAssetId = selectedSide === "YES" 
        ? selectedMarketData.assetIds[0]
        : selectedMarketData.assetIds[1];
      return liveTrades.filter(trade => trade.assetId === targetAssetId);
    }
    return selectedInstance.trades;
  }, [liveTrades, selectedMarketData?.assetIds, selectedSide, selectedInstance.trades]);
  
  // Use live orderbook for visualization
  const orderBookForViz = liveOrderBook;

  // Performance state for UI (updates in real-time) - must be after livePerformance is declared
  const performance = useMemo(() => {
    return livePerformance.totalTrades > 0 ? livePerformance : selectedInstance.performance;
  }, [livePerformance, selectedInstance.performance]);

  // Calculate P&L chart data using performance snapshots (includes unrealized P&L)
  const pnlChartData = useMemo(() => {
    // Use performance history snapshots if available (from live market maker)
    if (livePerformanceHistory && livePerformanceHistory.length > 0) {
      // Convert snapshots to chart format
      return livePerformanceHistory.map(snap => ({
        timestamp: snap.timestamp,
        pnl: snap.totalPnL || 0,
      }));
    }
    
    // Fallback: Use trades if no snapshots available (backward compatibility)
    let runningPnL = 0;
    const pnlHistory: Array<{ timestamp: number; pnl: number }> = [];
    pnlHistory.push({ timestamp: Date.now() - 3600000, pnl: 0 });
    [...trades].reverse().forEach((trade) => {
      if (trade.pnl !== undefined) {
        runningPnL += trade.pnl;
      }
      pnlHistory.push({ timestamp: trade.timestamp, pnl: runningPnL });
    });
    // Add current total P&L (includes unrealized) as final point
    pnlHistory.push({
      timestamp: Date.now(),
      pnl: performance.totalPnL,
    });
    return pnlHistory;
  }, [livePerformanceHistory, performanceHistoryVersion, trades, performance.totalPnL]);

  // Sync trades to multi-market manager
  useEffect(() => {
    if (trades.length > 0 && selectedMarketData) {
      const manager = marketManagerRef.current;
      const position = manager.getPosition(selectedMarket);
      
      if (position) {
        // Calculate net inventory from trades
        let inventory = 0;
        let realizedPnL = 0;
        
        trades.forEach(trade => {
          if (trade.side === "BUY") {
            inventory += trade.size;
          } else {
            inventory -= trade.size;
          }
          if (trade.pnl !== undefined) {
            realizedPnL += trade.pnl;
          }
        });
        
        // Update position
        manager.updatePosition(selectedMarket, {
          inventory,
          realizedPnL,
          trades: trades.length,
          unrealizedPnL: performance.unrealizedPnL,
        });
        
        // Update positions state
        const allPositions = manager.getAllPositions();
        const positionsMap = new Map<string, MarketPosition>();
        allPositions.forEach(pos => {
          positionsMap.set(pos.symbol, pos);
        });
        setPositions(positionsMap);
        
        // Update total performance
        const perf = manager.getTotalPerformance();
        const mmPerf = mmManagerRef.current.getTotalPerformance();
        setTotalPerformance({
          ...perf,
          totalOrders: mmPerf.totalOrders,
        });
      }
    }
  }, [trades, selectedMarket, selectedMarketData, performance.unrealizedPnL]);

  // Update config function
  const updateConfig = (symbol: string, side: "YES" | "NO", updates: Partial<typeof config>) => {
    mmManagerRef.current.updateConfig(symbol, side, updates);
    setMmUpdateTrigger(prev => prev + 1);
    
    // If updating the selected market/side, also update live MM config
    if (symbol === selectedMarket && side === selectedSide && config) {
      setLiveMMConfig(prev => ({
        ...prev,
        ...updates,
        rebalanceInterval: 5000,
      }));
    }
    
    // Auto-save config change to database
    if (saveStateRef.current) {
      saveStateRef.current();
    }
  };

  const handleConfigChange = (key: keyof typeof config, value: any) => {
    updateConfig(selectedMarket, selectedSide, { [key]: value });
  };

  // Get time remaining for a market
  const getTimeRemaining = (endTimeMs: number): string => {
    const now = Date.now();
    const remaining = endTimeMs - now;
    if (remaining <= 0) return "Expired";
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  // Get market status color
  const getMarketStatusColor = (market: MarketData, position: MarketPosition | undefined): string => {
    if (market.isExpired) return "zinc";
    if (position?.isSettled) {
      return (position.settlementPnL ?? 0) > 0 ? "green" : "red";
    }
    if (position && position.inventory !== 0) return "blue";
    return "zinc";
  };

  return (
    <div className="min-h-screen bg-black">
      {/* Render Market Maker Instances for all markets/sides */}
      {Array.from(markets.entries()).map(([symbol, marketData]) => {
        if (!marketData.assetIds || marketData.assetIds.length < 2) return null;
        
        const yesAssetId = marketData.assetIds[0];
        const noAssetId = marketData.assetIds[1];
        const yesConfig = mmManagerRef.current.getConfig(symbol, "YES");
        const noConfig = mmManagerRef.current.getConfig(symbol, "NO");
        
        return (
          <div key={symbol} style={{ display: "none" }}>
            <MarketMakerInstance
              symbol={symbol}
              side="YES"
              assetId={yesAssetId}
              marketId={marketData.id}
              config={yesConfig}
              manager={mmManagerRef.current}
              onUpdate={() => setMmUpdateTrigger(prev => prev + 1)}
            />
            <MarketMakerInstance
              symbol={symbol}
              side="NO"
              assetId={noAssetId}
              marketId={marketData.id}
              config={noConfig}
              manager={mmManagerRef.current}
              onUpdate={() => setMmUpdateTrigger(prev => prev + 1)}
            />
          </div>
        );
      })}
      
      <div className="mx-auto max-w-[1920px] px-4 py-4">
        {/* Compact Header with Key Metrics */}
        <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
          <Link
            href="/"
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
              Back
          </Link>
            <h1 className="text-xl font-bold text-white">Multi-Market Maker</h1>
            <div className={`h-2 w-2 rounded-full ${wsConnected ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
            <span className="text-xs text-zinc-400">
              {wsConnected ? "WebSocket Connected" : "WebSocket Disconnected"} | {isDiscovering ? "Discovering..." : "Ready"}
            </span>
        </div>

          {/* Key Metrics Bar */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
              <span className="text-xs text-zinc-400">Total P&L</span>
              <span className={`text-sm font-bold ${totalPerformance.totalPnL >= 0 ? "text-green-400" : "text-red-400"}`}>
                ${totalPerformance.totalPnL.toFixed(2)}
              </span>
        </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
              <span className="text-xs text-zinc-400">Won</span>
              <span className="text-sm font-semibold text-green-400">{totalPerformance.marketsWon}</span>
          </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
              <span className="text-xs text-zinc-400">Lost</span>
              <span className="text-sm font-semibold text-red-400">{totalPerformance.marketsLost}</span>
              </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
              <span className="text-xs text-zinc-400">Active</span>
              <span className="text-sm font-semibold text-blue-400">{totalPerformance.marketsActive}</span>
              </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
              <span className="text-xs text-zinc-400">Trades</span>
              <span className="text-sm font-semibold text-white">{totalPerformance.totalTrades}</span>
              </div>
            </div>
        </div>

        {/* Market Transitions Alert */}
        {marketTransitions.length > 0 && (
          <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-xs font-semibold text-blue-400">Market Transitions</span>
        </div>
            <div className="space-y-1">
              {marketTransitions.slice(-3).reverse().map((transition, idx) => (
                <div key={idx} className="text-xs text-zinc-300">
                  <span className="font-medium">{transition.symbol}</span> market transitioned at {new Date(transition.timestamp).toLocaleTimeString()}
                    </div>
              ))}
                  </div>
                    </div>
                  )}

        {/* Markets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {["BTC", "ETH", "SOL", "XRP"].map((symbol) => {
            const market = markets.get(symbol);
            const position = positions.get(symbol);
            const isSelected = selectedMarket === symbol;
            
            if (!market) {
              return (
                <div key={symbol} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                  <div className="text-xs text-zinc-500">Loading {symbol}...</div>
                </div>
              );
            }
            
            const statusColor = getMarketStatusColor(market, position);
            const timeRemaining = getTimeRemaining(market.endTimeMs);
            const isLoss = position?.isSettled && (position.settlementPnL ?? 0) < 0;
            
                                return (
                                  <div
                key={symbol}
                onClick={() => setSelectedMarket(symbol)}
                className={`rounded-lg border-2 p-3 cursor-pointer transition-all ${
                  isSelected
                    ? "border-blue-500 bg-blue-500/10"
                    : isLoss
                    ? "border-red-500/50 bg-red-500/5"
                    : `border-zinc-800 bg-zinc-900 hover:border-zinc-700`
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{symbol}</span>
                    {isLoss && (
                      <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
                        LOSS
                                          </span>
                                        )}
                    {position?.isSettled && (position.settlementPnL ?? 0) > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30">
                        WIN
                                      </span>
                                    )}
                                  </div>
                  <div className={`w-2 h-2 rounded-full ${
                    statusColor === "green" ? "bg-green-400" :
                    statusColor === "red" ? "bg-red-400" :
                    statusColor === "blue" ? "bg-blue-400" :
                    "bg-zinc-500"
                  }`} />
                            </div>
                
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Time Left</span>
                    <span className="text-zinc-300">{timeRemaining}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Inventory</span>
                    <span className={`font-semibold ${
                      (position?.inventory ?? 0) >= 0 ? "text-green-400" : "text-red-400"
                    }`}>
                      {(position?.inventory ?? 0) >= 0 ? "+" : ""}{(position?.inventory ?? 0).toFixed(2)}
                                </span>
                              </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">P&L</span>
                    <span className={`font-semibold ${
                      ((position?.realizedPnL ?? 0) + (position?.unrealizedPnL ?? 0)) >= 0 ? "text-green-400" : "text-red-400"
                    }`}>
                      ${((position?.realizedPnL ?? 0) + (position?.unrealizedPnL ?? 0)).toFixed(2)}
                                        </span>
                                      </div>
                  {position?.isSettled && position.settlementPnL !== undefined && (
                    <div className="flex items-center justify-between pt-1 border-t border-zinc-800">
                      <span className="text-zinc-400">Settlement</span>
                      <span className={`font-bold ${
                        position.settlementPnL >= 0 ? "text-green-400" : "text-red-400"
                      }`}>
                        {position.settlementPnL >= 0 ? "+" : ""}${position.settlementPnL.toFixed(2)}
                                      </span>
                                      </div>
                                    )}
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Trades</span>
                    <span className="text-zinc-300">{position?.trades ?? 0}</span>
                  </div>
                </div>
                                  </div>
                                );
                              })}
                            </div>

        {/* Selected Market Details */}
        {selectedMarketData && (
          <div className="grid grid-cols-12 gap-4">
            {/* Left Column - Market Details & Orders (8 cols) */}
            <div className="col-span-12 xl:col-span-8 space-y-4">
              {/* Market/Side Selector */}
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-1 border border-zinc-800">
                  <button
                    onClick={() => setSelectedSide("YES")}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      selectedSide === "YES"
                        ? "bg-blue-600 text-white"
                        : "bg-transparent text-zinc-400 hover:text-white"
                    }`}
                  >
                    YES
                  </button>
                  <button
                    onClick={() => setSelectedSide("NO")}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      selectedSide === "NO"
                        ? "bg-purple-600 text-white"
                        : "bg-transparent text-zinc-400 hover:text-white"
                    }`}
                  >
                    NO
                  </button>
                </div>
                <span className="text-xs text-zinc-400">
                  Viewing: {selectedMarket} {selectedSide}
                </span>
              </div>
              
              {/* Market Maker Visualization - Live Price Ladder */}
              <MarketMakerVisualization
                orderBook={orderBookForViz}
                orders={orders}
                config={config}
                isConnected={orderBookConnected}
                performance={performance}
                assetIds={selectedAssetId ? [selectedAssetId] : null}
                actualSpreadBps={actualSpreadBps}
              />
              
              {/* Market Info Card */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white">{selectedMarketData.title}</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {new Date(selectedMarketData.startTimeMs).toLocaleString()} - {new Date(selectedMarketData.endTimeMs).toLocaleString()}
                    </p>
                              </div>
                  <div className="text-right">
                    <div className="text-xs text-zinc-400">Time Remaining</div>
                    <div className="text-sm font-semibold text-white">
                      {getTimeRemaining(selectedMarketData.endTimeMs)}
                                      </div>
                                    </div>
                                      </div>
                
                {selectedMarketData.referencePrice && (
                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <span className="text-zinc-400">Reference Price: </span>
                      <span className="text-white font-semibold">${selectedMarketData.referencePrice.toFixed(2)}</span>
                                  </div>
                            </div>
                          )}
              </div>

              {/* Orders & Trades */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Active Orders */}
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-white">
                      All Orders ({allOrders.length})
                    </h2>
                    <span className="text-xs text-zinc-500">
                      {orders.filter((o) => o.filled).length} filled
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-80 overflow-y-auto">
                    {allOrders.length === 0 ? (
                      <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                        <p className="text-zinc-400 text-xs">No orders placed yet</p>
                      </div>
                    ) : (
                      orders.filter((o) => !o.filled).slice(0, 10).map((order) => (
                        <div key={order.id} className="p-2 rounded-lg bg-zinc-800 border border-zinc-700">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                order.side === "BUY" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                              }`}>
                                  {order.side}
                                </span>
                              <span className="text-white text-xs font-medium">${(order.price * 100).toFixed(2)}¢</span>
                              <span className="text-zinc-400 text-xs">×{order.size.toFixed(1)}</span>
                              </div>
                            </div>
                      </div>
                      ))
                )}
              </div>
            </div>

            {/* Recent Trades */}
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <h2 className="text-sm font-semibold text-white mb-3">
                    All Trades ({allTrades.length})
              </h2>
                  <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {allTrades.length === 0 ? (
                      <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                        <p className="text-zinc-400 text-xs">No trades executed yet</p>
                  </div>
                ) : (
                      allTrades.slice(0, 15).map((trade) => {
                        const isLoss = (trade.pnl ?? 0) < 0;
                        return (
                    <div
                      key={`${trade.marketSymbol}-${trade.marketSide}-${trade.id}`}
                            className={`p-2 rounded-lg border transition-colors ${
                              isLoss
                                ? "bg-red-500/5 border-red-500/30"
                                : "bg-zinc-800 border-zinc-700 hover:border-zinc-600"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                  trade.side === "BUY" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                                }`}>
                            {trade.side}
                          </span>
                                <span className="text-white text-xs font-medium">${(trade.price * 100).toFixed(2)}¢</span>
                                <span className="text-zinc-400 text-xs">×{trade.size.toFixed(1)}</span>
                                <span className="px-1.5 py-0.5 rounded text-xs bg-zinc-700 text-zinc-300">
                                  {trade.marketSymbol} {trade.marketSide}
                                </span>
                          </div>
                          {trade.pnl !== undefined && (
                                <span className={`text-xs font-semibold ${
                                  trade.pnl >= 0 ? "text-green-400" : "text-red-400"
                                }`}>
                                {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                              </span>
                          )}
                        </div>
                      </div>
                        );
                      })
                    )}
                  </div>
              </div>
            </div>
          </div>

            {/* Right Column - Performance & Config (4 cols) */}
            <div className="col-span-12 xl:col-span-4 space-y-4">
              {/* Selected Market Performance */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-white">{selectedMarket} {selectedSide} Performance</h2>
                </div>
                <div className="space-y-3">
                  <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-400">Total P&L</span>
                      <span className={`text-lg font-bold ${
                        performance.totalPnL >= 0 ? "text-green-400" : "text-red-400"
                      }`}>
                        ${performance.totalPnL.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>Realized: ${performance.realizedPnL.toFixed(2)}</span>
                      <span>Unrealized: ${performance.unrealizedPnL.toFixed(2)}</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-zinc-800/50 rounded p-2">
                      <div className="text-zinc-400 mb-0.5">Total Balance</div>
                      <div className={`font-semibold ${
                        performance.balance >= 10 ? "text-green-400" : "text-zinc-300"
                      }`}>
                        ${performance.balance.toFixed(2)}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">
                        <div>Available: ${((performance.availableBalance ?? performance.balance) || 0).toFixed(2)}</div>
                        <div>Locked: ${((performance.lockedBalance ?? 0) || 0).toFixed(2)}</div>
                      </div>
                    </div>
                    <div className="bg-zinc-800/50 rounded p-2">
                      <div className="text-zinc-400 mb-0.5">Inventory</div>
                      <div className={`font-semibold ${
                        performance.inventory >= 0 ? "text-green-400" : "text-red-400"
                      }`}>
                        {performance.inventory >= 0 ? "+" : ""}{performance.inventory.toFixed(1)}
                      </div>
                      </div>
                    <div className="bg-zinc-800/50 rounded p-2">
                      <div className="text-zinc-400 mb-0.5">Realized</div>
                      <div className={`font-semibold ${
                        performance.realizedPnL >= 0 ? "text-green-400" : "text-red-400"
                      }`}>
                        ${performance.realizedPnL.toFixed(2)}
                    </div>
                  </div>
                    <div className="bg-zinc-800/50 rounded p-2">
                      <div className="text-zinc-400 mb-0.5">Unrealized</div>
                      <div className={`font-semibold ${
                        performance.unrealizedPnL >= 0 ? "text-green-400" : "text-red-400"
                      }`}>
                        ${performance.unrealizedPnL.toFixed(2)}
                </div>
                </div>
                </div>
              </div>
            </div>

              {/* Configuration - Collapsible */}
              <details className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
                <summary className="p-4 cursor-pointer text-sm font-semibold text-white hover:bg-zinc-800 transition-colors">
                  Configuration
                </summary>
                <div className="p-4 pt-0 space-y-3 border-t border-zinc-800">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">
                        Spread (bps)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        step="1"
                        value={config.spreadBps}
                        onChange={(e) => handleConfigChange("spreadBps", Number(e.target.value))}
                        className="w-full px-2 py-1.5 rounded bg-zinc-800 text-white text-xs border border-zinc-700 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">
                        Order Size ($)
                      </label>
                      <input
                        type="number"
                        min="0.1"
                        max="10"
                        step="0.1"
                        value={config.orderSize}
                        onChange={(e) => handleConfigChange("orderSize", Number(e.target.value))}
                        className="w-full px-2 py-1.5 rounded bg-zinc-800 text-white text-xs border border-zinc-700 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">
                        Max Position ($)
                      </label>
                      <input
                        type="number"
                        min="0.1"
                        max="10"
                        step="0.1"
                        value={config.maxPosition}
                        onChange={(e) => handleConfigChange("maxPosition", Number(e.target.value))}
                        className="w-full px-2 py-1.5 rounded bg-zinc-800 text-white text-xs border border-zinc-700 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">
                        Initial Capital ($)
                      </label>
                      <input
                        type="number"
                        min="10"
                        max="10000"
                        step="10"
                        value={config.initialCapital ?? 100}
                        onChange={(e) => handleConfigChange("initialCapital", Number(e.target.value))}
                        className="w-full px-2 py-1.5 rounded bg-zinc-800 text-white text-xs border border-zinc-700 focus:border-blue-500 focus:outline-none"
                      />
                      <p className="text-xs text-zinc-500 mt-0.5">Starting capital for this market/side</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">
                        Enabled
                      </label>
                      <div className="flex items-center gap-2 mt-1.5">
                        <input
                          type="checkbox"
                          checked={config.enabled}
                          onChange={(e) => handleConfigChange("enabled", e.target.checked)}
                          className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs text-zinc-300">{config.enabled ? "Active" : "Paused"}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Per-Market Config Summary */}
                  <div className="pt-3 border-t border-zinc-800">
                    <div className="text-xs font-semibold text-zinc-400 mb-2">All Markets Config</div>
                    <div className="space-y-1.5 text-xs">
                      {["BTC", "ETH", "SOL", "XRP"].map((sym) => (
                        <div key={sym} className="flex items-center justify-between">
                          <span className="text-zinc-400">{sym}:</span>
                          <div className="flex items-center gap-2">
                            <span className="text-blue-400">YES {mmManagerRef.current.getConfig(sym, "YES").spreadBps}bps</span>
                            <span className="text-purple-400">NO {mmManagerRef.current.getConfig(sym, "NO").spreadBps}bps</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Reset Button */}
                  <div className="pt-3 border-t border-zinc-800">
                    <div className="text-xs font-semibold text-zinc-400 mb-2">Reset Market Maker</div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={async () => {
                          if (confirm(`Reset ${selectedMarket} ${selectedSide}? This will delete all orders, trades, and performance data for this market/side.`)) {
                            try {
                              const response = await fetch("/api/market-maker/reset", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  marketSymbol: selectedMarket,
                                  side: selectedSide,
                                  resetAll: false,
                                }),
                              });
                              const data = await response.json();
                              if (data.success) {
                                // Reset the instance in memory
                                const instance = mmManagerRef.current.getInstance(selectedMarket, selectedSide, "", "");
                                const config = mmManagerRef.current.getConfig(selectedMarket, selectedSide);
                                instance.orders = [];
                                instance.trades = [];
                                instance.performance = {
                                  totalPnL: 0,
                                  realizedPnL: 0,
                                  unrealizedPnL: 0,
                                  totalTrades: 0,
                                  inventory: 0,
                                  balance: config.initialCapital,
                                  lockedBalance: 0,
                                  availableBalance: config.initialCapital,
                                  maxDrawdown: 0,
                                  maxDrawdownPercent: 0,
                                  sharpeRatio: null,
                                  winRate: 0,
                                  riskOfLoss: 0,
                                  peakBalance: config.initialCapital,
                                  totalFees: 0,
                                  netPnL: 0,
                                  exposure: 0,
                                  maxExposure: 0,
                                  fillRate: 0,
                                  avgQueueTime: 0,
                                  orderBookValidationErrors: 0,
                                  spreadCaptured: 0,
                                  buyTrades: 0,
                                  sellTrades: 0,
                                };
                                setMmUpdateTrigger(prev => prev + 1);
                                alert("Market reset successfully!");
                              } else {
                                alert(`Reset failed: ${data.error}`);
                              }
                            } catch (error) {
                              console.error("[Reset] Error:", error);
                              alert("Failed to reset market");
                            }
                          }
                        }}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded transition-colors"
                      >
                        Reset {selectedMarket} {selectedSide}
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm("Reset ALL markets? This will delete all orders, trades, and performance data for ALL markets. This cannot be undone.")) {
                            try {
                              const response = await fetch("/api/market-maker/reset", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  resetAll: true,
                                }),
                              });
                              const data = await response.json();
                              if (data.success) {
                                // Reset all instances in memory
                                mmManagerRef.current.getAllInstances().forEach(instance => {
                                  const config = mmManagerRef.current.getConfig(instance.symbol, instance.side);
                                  instance.orders = [];
                                  instance.trades = [];
                                  instance.performance = {
                                    totalPnL: 0,
                                    realizedPnL: 0,
                                    unrealizedPnL: 0,
                                    totalTrades: 0,
                                    inventory: 0,
                                    balance: config.initialCapital,
                                    lockedBalance: 0,
                                    availableBalance: config.initialCapital,
                                    maxDrawdown: 0,
                                    maxDrawdownPercent: 0,
                                    sharpeRatio: null,
                                    winRate: 0,
                                    riskOfLoss: 0,
                                    peakBalance: config.initialCapital,
                                    totalFees: 0,
                                    netPnL: 0,
                                    exposure: 0,
                                    maxExposure: 0,
                                    fillRate: 0,
                                    avgQueueTime: 0,
                                    orderBookValidationErrors: 0,
                                    spreadCaptured: 0,
                                    buyTrades: 0,
                                    sellTrades: 0,
                                  };
                                });
                                setMmUpdateTrigger(prev => prev + 1);
                                alert("All markets reset successfully!");
                              } else {
                                alert(`Reset failed: ${data.error}`);
                              }
                            } catch (error) {
                              console.error("[Reset] Error:", error);
                              alert("Failed to reset all markets");
                            }
                          }
                        }}
                        className="px-3 py-1.5 bg-red-800 hover:bg-red-900 text-white text-xs font-medium rounded transition-colors"
                      >
                        Reset All Markets
                      </button>
                    </div>
                  </div>
                  </div>
              </details>

            {/* P&L Chart */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <h2 className="text-sm font-semibold text-white mb-3">P&L Chart</h2>
              <PnLChart
                  data={pnlChartData}
                  height={150}
              />
            </div>
          </div>
                        </div>
                      )}
      </div>
    </div>
  );
}
