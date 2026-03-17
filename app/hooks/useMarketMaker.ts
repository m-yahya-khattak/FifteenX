"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useCLOBOrderBook } from "./useCLOBOrderBook";
import { useDualAssetOrderBook } from "./useDualAssetOrderBook";
import {
  AdaptiveMarketMakerController,
  AdaptiveControllerConfig,
  ControllerOutput,
  OrderBookSnapshot,
} from "../lib/adaptiveMarketMaker";

export interface MarketMakerConfig {
  spreadBps: number; // Spread in basis points (e.g., 50 = 0.5%) - DEPRECATED: Use adaptive controller
  orderSize: number; // Size of each order - DEPRECATED: Use adaptive controller baseSize
  maxPosition: number; // Maximum position size
  rebalanceInterval: number; // How often to rebalance orders (ms)
  initialCapital: number; // Starting capital (1-100 USDT)
  enabled: boolean;
  // Backtest engine config
  makerFee: number; // Maker fee in basis points
  takerFee: number; // Taker fee in basis points
  tickSize: number; // Minimum price increment
  minOrderSize: number; // Minimum order size
  maxOrderSize: number; // Maximum order size
  placementLatency: number; // Latency for order placement (ms)
  cancellationLatency: number; // Latency for order cancellation (ms)
  maxInventory: number; // Maximum inventory position
  maxExposure: number; // Maximum exposure limit
  queuePosition: number; // Queue position (0-1, 1 = front)
  // Adaptive controller config
  useAdaptiveController?: boolean; // Enable adaptive controller (default: false for backward compat)
  adaptiveConfig?: AdaptiveControllerConfig; // Adaptive controller parameters
}

export interface MarketMakerOrder {
  id: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  assetId: string;
  timestamp: number;
  filled?: boolean;
  filledSize?: number;
}

export interface MarketMakerTrade {
  id: string;
  orderId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  assetId: string;
  timestamp: number;
  pnl?: number;
}

export interface MarketMakerPerformance {
  totalPnL: number;
  realizedPnL: number;
  unrealizedPnL: number;
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;
  spreadCaptured: number;
  inventory: number; // Net position
  balance: number; // Total balance (available + locked)
  lockedBalance: number; // Capital locked in unfilled BUY orders
  availableBalance: number; // Available capital (balance - lockedBalance)
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number | null;
  winRate: number;
  riskOfLoss: number; // Probability of losing money
  peakBalance: number;
  totalFees: number;
  netPnL: number; // PnL after fees
  exposure: number; // Current exposure
  maxExposure: number; // Peak exposure
  fillRate: number; // Percentage of orders that filled
  avgQueueTime: number; // Average queue time in ms
  orderBookValidationErrors: number; // Count of orderbook validation errors
}

const DEFAULT_CONFIG: MarketMakerConfig = {
  spreadBps: 50, // 0.5% spread
  orderSize: 1, // $1 per order (default for multi-market)
  maxPosition: 1, // Max $1 position (default for multi-market)
  rebalanceInterval: 5000, // 5 seconds
  initialCapital: 100, // Starting capital in USDT (default $100 per market)
  enabled: false,
  // Backtest engine defaults
  makerFee: 0, // 0% maker fee (no maker fees on Polymarket)
  takerFee: 20, // 0.2% taker fee
  tickSize: 0.0001, // 0.01% tick size
  minOrderSize: 1, // $1 minimum
  maxOrderSize: 1000, // $1000 maximum
  placementLatency: 50, // 50ms placement latency
  cancellationLatency: 30, // 30ms cancellation latency
  maxInventory: 1000, // Max inventory
  maxExposure: 500, // Max exposure $500
  queuePosition: 0.5, // Conservative: 50% queue position
};

export function useMarketMaker(
  assetIds: string[] | null, 
  mode: "live" | "backtest" = "live",
  marketStartTimeMs?: number,
  marketEndTimeMs?: number
) {
  // For dual-asset market making: track separate orderbooks for YES and NO
  // Fallback to single orderbook for backward compatibility
  // Use shared WebSocket connection that subscribes to all assets at once
  // In backtest mode, skip WebSocket connections to avoid creating too many connections
  const { dualOrderBook, getYesMidPrice, getNoMidPrice: getNoMidPriceFromHook, isBothConnected } = useDualAssetOrderBook(mode === "backtest" ? null : assetIds);
  const { orderBook: legacyOrderBook, isConnected: legacyIsConnected, lastTrade } = useCLOBOrderBook(mode === "backtest" ? null : assetIds);
  
  // Use dual orderbook if available, otherwise fallback to legacy
  const orderBook = dualOrderBook.yesOrderBook.bestBid && dualOrderBook.yesOrderBook.bestAsk
    ? dualOrderBook.yesOrderBook
    : legacyOrderBook;
  const isConnected = isBothConnected || legacyIsConnected;
  const [config, setConfig] = useState<MarketMakerConfig>(DEFAULT_CONFIG);
  const [orders, setOrders] = useState<MarketMakerOrder[]>([]);
  const [trades, setTrades] = useState<MarketMakerTrade[]>([]);
  const [performance, setPerformance] = useState<MarketMakerPerformance>({
    totalPnL: 0,
    realizedPnL: 0,
    unrealizedPnL: 0,
    totalTrades: 0,
    buyTrades: 0,
    sellTrades: 0,
    spreadCaptured: 0,
    inventory: 0,
    balance: DEFAULT_CONFIG.initialCapital,
    lockedBalance: 0, // Capital locked in unfilled BUY orders
    availableBalance: DEFAULT_CONFIG.initialCapital, // Available capital
    maxDrawdown: 0,
    maxDrawdownPercent: 0,
    sharpeRatio: null,
    winRate: 0,
    riskOfLoss: 0,
    peakBalance: DEFAULT_CONFIG.initialCapital,
    totalFees: 0,
    netPnL: 0,
    exposure: 0,
    maxExposure: 0,
    fillRate: 0,
    avgQueueTime: 0,
    orderBookValidationErrors: 0,
  });

  const ordersRef = useRef<MarketMakerOrder[]>([]);
  const tradesRef = useRef<MarketMakerTrade[]>([]); // Fix issue #2: Add tradesRef for backtest completion
  const performanceRef = useRef<MarketMakerPerformance>(performance);
  const configRef = useRef<MarketMakerConfig>(config); // Fix issue #2: Add configRef for backtest completion
  const rebalanceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const checkFillsRef = useRef<(() => void) | null>(null); // Ref to store checkFills function
  const backtestDataRef = useRef<any[]>([]);
  
  // Adaptive controller (initialized if useAdaptiveController is enabled)
  const adaptiveControllerRef = useRef<AdaptiveMarketMakerController | null>(null);
  const controllerOutputRef = useRef<ControllerOutput | null>(null);
  const lastControllerUpdateRef = useRef<number>(0);
  // State to track controller output spread for real-time updates
  const [controllerSpread, setControllerSpread] = useState<number | null>(null);
  const backtestIndexRef = useRef(0);
  const isBacktestingRef = useRef(false);
  const positionHistoryRef = useRef<Array<{ price: number; size: number; side: "BUY" | "SELL"; assetId: string }>>([]);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const performanceHistoryRef = useRef<Array<{ 
    timestamp: number; 
    balance: number; 
    totalPnL: number;
    realizedPnL?: number;
    unrealizedPnL?: number;
    inventory?: number;
  }>>([]);
  // State trigger to force re-renders when history updates
  const [performanceHistoryVersion, setPerformanceHistoryVersion] = useState(0);
  const simTimeRef = useRef<number>(0); // Simulated time from historical data
  const lastSimTimeRef = useRef<number>(0);
  const lastSnapshotTimeRef = useRef<number>(0); // Fix issue #12: Track last snapshot time separately
  const [testMode, setTestMode] = useState(false); // Test mode: force aggressive volume at order prices
  const fillDebugLogRef = useRef<Array<{ timestamp: number; message: string; data?: any }>>([]);
  const [backtestOrderBook, setBacktestOrderBook] = useState<{
    bestBid: string | null;
    bestAsk: string | null;
    bids: Array<{ price: string; size: string }>;
    asks: Array<{ price: string; size: string }>;
  }>({
    bestBid: null,
    bestAsk: null,
    bids: [],
    asks: [],
  });

  // Update refs when state changes
  useEffect(() => {
    ordersRef.current = orders;
    tradesRef.current = trades;
    performanceRef.current = performance;
    configRef.current = config;
  }, [orders, trades, performance, config]);

  // Calculate mid price from orderbook
  const getMidPrice = useCallback((): number | null => {
    // In backtest mode, use simulated orderbook
    const activeOrderBook = mode === "backtest" && isBacktestingRef.current
      ? backtestOrderBook 
      : orderBook;
      
    if (!activeOrderBook.bestBid || !activeOrderBook.bestAsk) return null;
    const bid = parseFloat(activeOrderBook.bestBid);
    const ask = parseFloat(activeOrderBook.bestAsk);
    if (isNaN(bid) || isNaN(ask)) return null;
    return (bid + ask) / 2;
  }, [orderBook.bestBid, orderBook.bestAsk, backtestOrderBook, mode]);

  // Get NO asset mid price (for dual-asset market making)
  const getNoMidPrice = useCallback((): number | null => {
    if (mode === "backtest" && isBacktestingRef.current) {
      // In backtest, NO price = 1 - YES price (binary market constraint)
      const yesMid = getMidPrice();
      return yesMid !== null ? 1 - yesMid : null;
    }
    // In live mode: use NO orderbook from dual asset hook
    const noMid = getNoMidPriceFromHook();
    if (noMid === null && mode === "live") {
      console.log("[NO Side] getNoMidPrice() returned null - NO orderbook may not have data yet");
    }
    return noMid;
  }, [mode, getMidPrice, getNoMidPriceFromHook]);

  // Initialize adaptive controller if enabled
  useEffect(() => {
    if (config.useAdaptiveController && !adaptiveControllerRef.current) {
      const controllerConfig: AdaptiveControllerConfig = {
        K: config.adaptiveConfig?.K ?? 2.0,
        minSpreadBps: config.adaptiveConfig?.minSpreadBps ?? 10,
        maxSpreadBps: config.adaptiveConfig?.maxSpreadBps ?? 500,
        gamma: config.adaptiveConfig?.gamma ?? 0.5,
        baseSize: config.adaptiveConfig?.baseSize ?? config.orderSize,
        minSize: config.adaptiveConfig?.minSize ?? config.minOrderSize,
        maxSize: config.adaptiveConfig?.maxSize ?? config.maxOrderSize,
        pauseToxicityThreshold: config.adaptiveConfig?.pauseToxicityThreshold ?? 0.65,
        reduceSizeToxicityThreshold: config.adaptiveConfig?.reduceSizeToxicityThreshold ?? 0.5,
        sizeReductionFactor: config.adaptiveConfig?.sizeReductionFactor ?? 0.5,
        maxInventoryRatioSoft: config.adaptiveConfig?.maxInventoryRatioSoft ?? 0.5,
        maxInventoryRatioHard: config.adaptiveConfig?.maxInventoryRatioHard ?? 0.8,
        refreshMs: config.adaptiveConfig?.refreshMs ?? config.rebalanceInterval,
        noFillTightenMinutes: config.adaptiveConfig?.noFillTightenMinutes ?? 10,
        noFillTightenFactor: config.adaptiveConfig?.noFillTightenFactor ?? 0.9,
        noFillSizeIncreaseFactor: config.adaptiveConfig?.noFillSizeIncreaseFactor ?? 1.1,
        tickSize: config.tickSize,
        minPrice: 0.0,
        maxPrice: 1.0,
      };
      adaptiveControllerRef.current = new AdaptiveMarketMakerController(controllerConfig);
      console.log("[AdaptiveController] Initialized", controllerConfig);
    } else if (!config.useAdaptiveController && adaptiveControllerRef.current) {
      // Disable controller
      adaptiveControllerRef.current = null;
      controllerOutputRef.current = null;
    }
  }, [config.useAdaptiveController, config.adaptiveConfig, config.orderSize, config.minOrderSize, config.maxOrderSize, config.rebalanceInterval, config.tickSize]);

  // Track previous values to avoid unnecessary updates for adaptive controller
  const prevAdaptiveOrderBookRef = useRef<{ bestBid: string | null; bestAsk: string | null }>({ bestBid: null, bestAsk: null });
  const prevInventoryRef = useRef<number>(0);
  
  // Update adaptive controller with market data (uses YES asset for primary signals)
  useEffect(() => {
    if (!adaptiveControllerRef.current || !config.enabled) return;
    
    const yesMid = getMidPrice(); // YES asset mid price
    if (!yesMid) return;

    // Use YES orderbook for adaptive controller (primary asset)
    const activeOrderBook = mode === "backtest" && isBacktestingRef.current
      ? backtestOrderBook 
      : (dualOrderBook.yesOrderBook.bestBid ? dualOrderBook.yesOrderBook : orderBook);

    // Check if orderbook actually changed
    const currentBid = activeOrderBook.bestBid;
    const currentAsk = activeOrderBook.bestAsk;
    if (prevAdaptiveOrderBookRef.current.bestBid === currentBid && 
        prevAdaptiveOrderBookRef.current.bestAsk === currentAsk &&
        prevInventoryRef.current === performanceRef.current.inventory) {
      return; // No change, skip update
    }
    
    prevAdaptiveOrderBookRef.current = { bestBid: currentBid, bestAsk: currentAsk };
    prevInventoryRef.current = performanceRef.current.inventory;

    const currentTime = isBacktestingRef.current ? simTimeRef.current : Date.now();
    
    // Create orderbook snapshot for toxicity estimator (YES asset)
    const bookSnapshot: OrderBookSnapshot = {
      bestBid: activeOrderBook.bestBid ? parseFloat(activeOrderBook.bestBid) : null,
      bestAsk: activeOrderBook.bestAsk ? parseFloat(activeOrderBook.bestAsk) : null,
      timestamp: currentTime,
    };

    // Update controller with market data (YES asset)
    adaptiveControllerRef.current.updateMarketData(
      yesMid,
      bookSnapshot,
      performanceRef.current.inventory,
      currentTime
    );

    // Compute quotes (based on YES asset)
    const output = adaptiveControllerRef.current.computeQuotes(
      yesMid,
      performanceRef.current.inventory,
      currentTime
    );
    
    controllerOutputRef.current = output;
    lastControllerUpdateRef.current = currentTime;
    // Update state to trigger re-renders when spread changes
    setControllerSpread(output.spread);

    // Log controller state (structured logging)
    if (testMode || process.env.NODE_ENV === 'development') {
      const noMid = getNoMidPrice();
      console.log("[AdaptiveController]", {
        yesMid: output.mid.toFixed(6),
        noMid: noMid?.toFixed(6) ?? "null",
        sigma: output.sigma.toFixed(6),
        toxicity: output.toxicity.toFixed(3),
        inventoryRatio: output.inventoryRatio.toFixed(3),
        spread: output.spread.toFixed(6),
        skew: output.skew.toFixed(6),
        yesBid: output.bid?.toFixed(6) ?? "null",
        yesAsk: output.ask?.toFixed(6) ?? "null",
        noBid: output.ask !== null ? (1 - output.ask).toFixed(6) : "null",
        noAsk: output.bid !== null ? (1 - output.bid).toFixed(6) : "null",
        size: output.size.toFixed(2),
        mode: output.mode,
        lastFillAge: output.lastFillAge.toFixed(1) + "s",
      });
    }
  }, [
    dualOrderBook.yesOrderBook.bestBid, 
    dualOrderBook.yesOrderBook.bestAsk,
    orderBook.bestBid, 
    orderBook.bestAsk, 
    backtestOrderBook.bestBid, 
    backtestOrderBook.bestAsk, 
    mode, 
    config.enabled, 
    config.useAdaptiveController, 
    testMode
  ]);

  // Place a market maker order
  const placeOrder = useCallback((
    side: "BUY" | "SELL",
    price: number,
    size: number,
    assetId: string
  ): MarketMakerOrder => {
    const currentTime = isBacktestingRef.current ? simTimeRef.current : Date.now();
    // Fix issue #10: Enforce tick size
    const tickedPrice = Math.round(price / configRef.current.tickSize) * configRef.current.tickSize;
    const order: MarketMakerOrder = {
      id: `mm-${currentTime}-${Math.random().toString(36).substr(2, 9)}`,
      side,
      price: tickedPrice,
      size,
      assetId,
      timestamp: currentTime,
      filled: false,
      filledSize: 0,
    };
    
    // Lock balance when placing BUY orders (capital reserved for purchase)
    if (side === "BUY") {
      const lockedAmount = tickedPrice * size;
      setPerformance(prev => {
        const currentLocked = prev.lockedBalance || 0;
        const newLocked = currentLocked + lockedAmount;
        const newAvailable = prev.balance - newLocked;
        const updated = {
          ...prev,
          lockedBalance: newLocked,
          availableBalance: Math.max(0, newAvailable),
        };
        performanceRef.current = updated;
        return updated;
      });
    }
    
    return order;
  }, []);

  // Simulate order fill (for backtesting or live simulation) with fees
  const simulateFill = useCallback((
    order: MarketMakerOrder,
    fillPrice: number,
    fillSize: number,
    fees: number = 0
  ) => {
      const currentTime = isBacktestingRef.current ? simTimeRef.current : Date.now();
      const trade: MarketMakerTrade = {
        id: `trade-${currentTime}-${Math.random().toString(36).substr(2, 9)}`,
        orderId: order.id,
        side: order.side,
        price: fillPrice,
        size: fillSize,
        assetId: order.assetId,
        timestamp: currentTime,
      };

      // Update performance
      const perf = { ...performanceRef.current };
      const positionHistory = positionHistoryRef.current;
      let realizedPnL = 0;
      
      // Add fees
      perf.totalFees += fees;
      perf.balance -= fees; // Deduct fees from balance
      
      // Unlock balance for filled BUY orders (capital was already locked when order was placed)
      if (order.side === "BUY") {
        const unlockedAmount = fillPrice * fillSize;
        const currentLocked = perf.lockedBalance || 0;
        perf.lockedBalance = Math.max(0, currentLocked - unlockedAmount);
        perf.availableBalance = perf.balance - perf.lockedBalance;
      }

    perf.totalTrades++;
    
    // DUAL ASSET INVENTORY TRACKING:
    // - YES asset: BUY YES = +inventory, SELL YES = -inventory
    // - NO asset: BUY NO = -inventory (equivalent to SELL YES), SELL NO = +inventory (equivalent to BUY YES)
    // This maintains a single signed inventory metric where positive = net long YES, negative = net short YES
    
    const isYesAsset = order.assetId === assetIds?.[0];
    const isNoAsset = order.assetId === assetIds?.[1];
    
    if (order.side === "BUY") {
      perf.buyTrades++;
      
      if (isYesAsset) {
        // BUY YES: increases inventory (long YES)
        perf.inventory += fillSize;
        perf.balance -= fillPrice * fillSize;
        
        // FIFO matching: BUY YES closes SELL YES shorts first, then creates new long
        let remainingSize = fillSize;
        while (remainingSize > 0 && positionHistory.length > 0) {
          const oldestPosition = positionHistory[0];
          if (oldestPosition.side === "SELL" && oldestPosition.assetId === order.assetId) {
            // Close short YES position
            const matchedSize = Math.min(remainingSize, oldestPosition.size);
            const pnl = (oldestPosition.price - fillPrice) * matchedSize; // Profit when closing short
            realizedPnL += pnl;
            perf.spreadCaptured += Math.abs(oldestPosition.price - fillPrice) * matchedSize;
            
            remainingSize -= matchedSize;
            oldestPosition.size -= matchedSize;
            
            if (oldestPosition.size <= 0) {
              positionHistory.shift();
            }
          } else {
            // No more matching shorts to close, break and create new long
            break;
          }
        }
        
        // If we still have remaining size, it's a new long position
        if (remainingSize > 0) {
          positionHistory.push({ price: fillPrice, size: remainingSize, side: "BUY", assetId: order.assetId });
        }
      } else if (isNoAsset) {
        // BUY NO: decreases inventory (equivalent to SELL YES)
        perf.inventory -= fillSize;
        perf.balance -= fillPrice * fillSize;
        
        // FIFO matching: BUY NO closes SELL NO positions (which are equivalent to BUY YES)
        let remainingSize = fillSize;
        while (remainingSize > 0 && positionHistory.length > 0) {
          const oldestPosition = positionHistory[0];
          if (oldestPosition.side === "SELL" && oldestPosition.assetId === order.assetId) {
            // Close SELL NO position (equivalent to closing BUY YES)
            const matchedSize = Math.min(remainingSize, oldestPosition.size);
            const pnl = (fillPrice - oldestPosition.price) * matchedSize;
            realizedPnL += pnl;
            perf.spreadCaptured += Math.abs(fillPrice - oldestPosition.price) * matchedSize;
            
            remainingSize -= matchedSize;
            oldestPosition.size -= matchedSize;
            
            if (oldestPosition.size <= 0) {
              positionHistory.shift();
            }
          } else {
            break;
          }
        }
        
        // Remaining size creates a new BUY NO position (equivalent to SELL YES short)
        if (remainingSize > 0) {
          positionHistory.push({ price: fillPrice, size: remainingSize, side: "BUY", assetId: order.assetId });
        }
      }
    } else {
      // SELL order
      perf.sellTrades++;
      
      if (isYesAsset) {
        // SELL YES: decreases inventory (short YES)
        perf.inventory -= fillSize;
        perf.balance += fillPrice * fillSize;
        
        // FIFO matching: SELL YES closes BUY YES longs first, then creates new short
        let remainingSize = fillSize;
        while (remainingSize > 0 && positionHistory.length > 0) {
          const oldestPosition = positionHistory[0];
          if (oldestPosition.side === "BUY" && oldestPosition.assetId === order.assetId) {
            // Close long YES position
            const matchedSize = Math.min(remainingSize, oldestPosition.size);
            const pnl = (fillPrice - oldestPosition.price) * matchedSize;
            realizedPnL += pnl;
            perf.spreadCaptured += Math.abs(fillPrice - oldestPosition.price) * matchedSize;
            
            remainingSize -= matchedSize;
            oldestPosition.size -= matchedSize;
            
            if (oldestPosition.size <= 0) {
              positionHistory.shift();
            }
          } else {
            // No more longs to close, break and create new short
            break;
          }
        }
        
        // If we still have remaining size, it's a new short position
        if (remainingSize > 0) {
          positionHistory.push({ price: fillPrice, size: remainingSize, side: "SELL", assetId: order.assetId });
        }
      } else if (isNoAsset) {
        // SELL NO: increases inventory (equivalent to BUY YES)
        perf.inventory += fillSize;
        perf.balance += fillPrice * fillSize;
        
        // FIFO matching: SELL NO closes BUY NO positions (which are equivalent to SELL YES)
        let remainingSize = fillSize;
        while (remainingSize > 0 && positionHistory.length > 0) {
          const oldestPosition = positionHistory[0];
          if (oldestPosition.side === "BUY" && oldestPosition.assetId === order.assetId) {
            // Close BUY NO position (equivalent to closing SELL YES)
            const matchedSize = Math.min(remainingSize, oldestPosition.size);
            const pnl = (oldestPosition.price - fillPrice) * matchedSize;
            realizedPnL += pnl;
            perf.spreadCaptured += Math.abs(oldestPosition.price - fillPrice) * matchedSize;
            
            remainingSize -= matchedSize;
            oldestPosition.size -= matchedSize;
            
            if (oldestPosition.size <= 0) {
              positionHistory.shift();
            }
          } else {
            break;
          }
        }
        
        // Remaining size creates a new SELL NO position (equivalent to BUY YES long)
        if (remainingSize > 0) {
          positionHistory.push({ price: fillPrice, size: remainingSize, side: "SELL", assetId: order.assetId });
        }
      }
    }

    perf.realizedPnL += realizedPnL;
    trade.pnl = realizedPnL;
    
    // Fix issue #3: Don't calculate netPnL here - it will be updated in the effect that computes totalPnL
    // totalPnL = realizedPnL + unrealizedPnL, and netPnL = totalPnL - totalFees
    // This is computed in the useEffect that watches orderBook changes
    
    // Update exposure
    const currentExposure = Math.abs(perf.inventory * fillPrice);
    perf.exposure = currentExposure;
    if (currentExposure > perf.maxExposure) {
      perf.maxExposure = currentExposure;
    }
    
    // Check inventory/exposure limits
    if (Math.abs(perf.inventory) > config.maxInventory) {
      console.warn("Max inventory limit exceeded:", perf.inventory);
    }
    if (perf.exposure > config.maxExposure) {
      console.warn("Max exposure limit exceeded:", perf.exposure);
    }

    // Update peak balance
    if (perf.balance > perf.peakBalance) {
      perf.peakBalance = perf.balance;
    }
    
    // Fix issue #4: Validate inventory consistency
    // DUAL ASSET INVENTORY CALCULATION:
    // YES asset: BUY = +inventory, SELL = -inventory
    // NO asset: BUY = -inventory (equivalent to SELL YES), SELL = +inventory (equivalent to BUY YES)
    let calculatedInventory = 0;
    const upAssetId = assetIds?.[0];
    positionHistory.forEach((pos) => {
      const isYesAsset = pos.assetId === upAssetId;
      if (isYesAsset) {
        // YES asset: BUY = +, SELL = -
        if (pos.side === "BUY") {
          calculatedInventory += pos.size;
        } else {
          calculatedInventory -= pos.size;
        }
      } else {
        // NO asset: BUY = - (equivalent to SELL YES), SELL = + (equivalent to BUY YES)
        if (pos.side === "BUY") {
          calculatedInventory -= pos.size;
        } else {
          calculatedInventory += pos.size;
        }
      }
    });
    
    // If there's a mismatch, log warning but use calculated value
    if (Math.abs(calculatedInventory - perf.inventory) > 0.0001) {
      console.warn("Inventory mismatch detected, correcting:", {
        stored: perf.inventory,
        calculated: calculatedInventory,
      });
      perf.inventory = calculatedInventory;
    }
    
    // Update performance ref immediately
    performanceRef.current = perf;
    setPerformance(perf);
    
      // Fix issue #2: Update tradesRef
      const updatedTrades = [trade, ...tradesRef.current].slice(0, 1000);
      tradesRef.current = updatedTrades;
      setTrades(updatedTrades);

      // Record fill in adaptive controller
      if (adaptiveControllerRef.current) {
        adaptiveControllerRef.current.recordFill(currentTime);
      }
    
    // Fix issue #12: Don't add snapshot here - snapshots are taken periodically in backtest loop
    // Only add snapshot if not in backtest mode (for live mode tracking)
    if (!isBacktestingRef.current) {
      performanceHistoryRef.current.push({
        timestamp: currentTime,
        balance: perf.balance,
        totalPnL: perf.realizedPnL + perf.unrealizedPnL, // Use current totalPnL
      });
      
      // Keep last 10000 snapshots
      if (performanceHistoryRef.current.length > 10000) {
        performanceHistoryRef.current.shift();
      }
    }

    // Update order
    setOrders((prev) =>
      prev.map((o) =>
        o.id === order.id
          ? {
              ...o,
              filled: (o.filledSize || 0) + fillSize >= o.size,
              filledSize: (o.filledSize || 0) + fillSize,
            }
          : o
      )
    );
    
    // Update ordersRef to keep in sync
    ordersRef.current = ordersRef.current.map((o) =>
      o.id === order.id
        ? {
            ...o,
            filled: (o.filledSize || 0) + fillSize >= o.size,
            filledSize: (o.filledSize || 0) + fillSize,
          }
        : o
    );
  }, []);

  // Calculate time-based adjustments for market making
  const getTimeBasedAdjustments = useCallback(() => {
    if (!marketStartTimeMs || !marketEndTimeMs) {
      // No market time data, use defaults
      return {
        spreadMultiplier: 1.0,
        cancellationTolerance: 2.0,
        orderSizeMultiplier: 1.0,
        rebalanceIntervalMultiplier: 1.0,
      };
    }

    const now = Date.now();
    const totalDuration = marketEndTimeMs - marketStartTimeMs;
    const timeRemaining = marketEndTimeMs - now;
    const timeElapsed = now - marketStartTimeMs;
    const timeProgress = timeElapsed / totalDuration; // 0 = start, 1 = end
    const minutesRemaining = timeRemaining / 1000 / 60;

    // Early market: First 30% of duration (more volatility expected)
    const isEarly = timeProgress < 0.3;
    // Late market: Last 20% of duration (convergence, less movement)
    const isLate = timeProgress > 0.8 || minutesRemaining < 3;
    // Very late: Last 2 minutes (strong convergence)
    const isVeryLate = minutesRemaining < 2;

    let spreadMultiplier = 1.0;
    let cancellationTolerance = 2.0;
    let orderSizeMultiplier = 1.0;

    if (isVeryLate) {
      // Very late: Tight spread, very conservative cancellation, larger sizes
      spreadMultiplier = 0.6; // 40% tighter spread
      cancellationTolerance = 1.2; // Only cancel if very far (1.2x spread)
      orderSizeMultiplier = 1.3; // Larger sizes to capture convergence
    } else if (isLate) {
      // Late: Tighter spread, conservative cancellation, slightly larger sizes
      spreadMultiplier = 0.75; // 25% tighter spread
      cancellationTolerance = 1.5; // Cancel if 1.5x spread away
      orderSizeMultiplier = 1.15; // Slightly larger sizes
    } else if (isEarly) {
      // Early: Wider spread, more aggressive cancellation, smaller sizes
      spreadMultiplier = 1.4; // 40% wider spread
      cancellationTolerance = 3.0; // Cancel if 3x spread away (more movement expected)
      orderSizeMultiplier = 0.85; // Smaller sizes (more uncertainty)
    } else {
      // Middle: Default values
      spreadMultiplier = 1.0;
      cancellationTolerance = 2.0;
      orderSizeMultiplier = 1.0;
    }

    return {
      spreadMultiplier,
      cancellationTolerance,
      orderSizeMultiplier,
      rebalanceIntervalMultiplier: isEarly ? 0.8 : isLate ? 1.2 : 1.0, // Faster early, slower late
      minutesRemaining,
      isEarly,
      isLate,
      isVeryLate,
    };
  }, [marketStartTimeMs, marketEndTimeMs]);

  // Rebalance orders
  const rebalanceOrders = useCallback(() => {
    // During backtest, check isBacktestingRef instead of config.enabled (which might not be updated yet)
    const isEnabled = isBacktestingRef.current ? true : config.enabled;
    
    if (!isEnabled || !assetIds || assetIds.length === 0) {
      console.log("Rebalance skipped:", { enabled: isEnabled, isBacktesting: isBacktestingRef.current, assetIds: assetIds?.length });
      return;
    }

    // Get mid prices for both YES and NO assets (separate markets)
    const yesMidPrice = getMidPrice(); // YES asset mid price
    const noMidPrice = getNoMidPrice(); // NO asset mid price
    
    if (!yesMidPrice) {
      // console.log("Rebalance skipped: No YES mid price available", {
      //   backtestOrderBook,
      //   orderBook,
      //   mode,
      //   isBacktesting: isBacktestingRef.current,
      // });
      return;
    }
    
    if (!noMidPrice) {
      console.log("[NO Side] Rebalance skipped: No NO mid price available - getNoMidPrice() returned null");
      return;
    }

    const upAssetId = assetIds[0];
    const downAssetId = assetIds[1];

    if (!upAssetId || !downAssetId) return;

    // Get time-based adjustments
    const timeAdjustments = getTimeBasedAdjustments();

    // Use adaptive controller spread if enabled, otherwise use config spread
    let yesSpreadBps = configRef.current.spreadBps;
    let noSpreadBps = configRef.current.spreadBps;
    
    if (configRef.current.useAdaptiveController && controllerOutputRef.current) {
      // Adaptive controller provides spread in absolute terms (not bps)
      // Convert to bps: spread / midPrice * 10000
      const adaptiveSpread = controllerOutputRef.current.spread;
      if (adaptiveSpread > 0) {
        yesSpreadBps = (adaptiveSpread / yesMidPrice) * 10000;
        // For NO side, use the same spread in bps terms
        noSpreadBps = (adaptiveSpread / noMidPrice) * 10000;
      }
    }

    // Calculate bid and ask prices for YES side based on YES mid price
    const yesBaseSpread = (yesSpreadBps / 10000) * yesMidPrice;
    const yesAdjustedSpread = yesBaseSpread * timeAdjustments.spreadMultiplier;
    let yesBidPrice = yesMidPrice - yesAdjustedSpread / 2;
    let yesAskPrice = yesMidPrice + yesAdjustedSpread / 2;
    
    // Fix issue #10: Enforce tick size on bid/ask prices
    yesBidPrice = Math.round(yesBidPrice / configRef.current.tickSize) * configRef.current.tickSize;
    yesAskPrice = Math.round(yesAskPrice / configRef.current.tickSize) * configRef.current.tickSize;
    
    // Calculate bid and ask prices for NO side based on NO mid price
    const noBaseSpread = (noSpreadBps / 10000) * noMidPrice;
    const noAdjustedSpread = noBaseSpread * timeAdjustments.spreadMultiplier;
    let noBidPrice = noMidPrice - noAdjustedSpread / 2;
    let noAskPrice = noMidPrice + noAdjustedSpread / 2;
    
    // Fix issue #10: Enforce tick size on bid/ask prices
    noBidPrice = Math.round(noBidPrice / configRef.current.tickSize) * configRef.current.tickSize;
    noAskPrice = Math.round(noAskPrice / configRef.current.tickSize) * configRef.current.tickSize;

    // Check position limits
    const currentInventory = performanceRef.current.inventory;
    const maxPos = config.maxPosition;

    // Time-aware cancellation: Only cancel orders that are significantly far from mid
    // Also check order age to avoid canceling recently placed orders
    // Use appropriate mid price and spread for each asset
    const currentTime = Date.now();
    const cancelledOrders: MarketMakerOrder[] = [];
    setOrders((prev) => {
      return prev.filter((order) => {
        // Determine which mid price and spread to use based on asset
        const orderMidPrice = order.assetId === upAssetId ? yesMidPrice : noMidPrice;
        const orderSpread = order.assetId === upAssetId ? yesAdjustedSpread : noAdjustedSpread;
        
        if (!orderMidPrice) {
          // If we don't have mid price for this asset, keep the order
          return true;
        }
        
        const priceDiff = Math.abs(order.price - orderMidPrice);
        const maxDiff = orderSpread * timeAdjustments.cancellationTolerance;
        
        // Don't cancel if order is within tolerance
        if (priceDiff <= maxDiff) {
          return true; // Keep order
        }
        
        // If order is far, check its age - don't cancel very recent orders (< 2 seconds)
        const orderAge = currentTime - order.timestamp;
        if (orderAge < 2000) {
          // Order is very recent, keep it even if far (might be adjusting)
          return true;
        }
        
        // Order is far and old enough, cancel it
        cancelledOrders.push(order);
        return false;
      });
    });
    
    // Unlock balance for cancelled BUY orders
    if (cancelledOrders.length > 0) {
      setPerformance(prev => {
        let totalUnlocked = 0;
        cancelledOrders.forEach(order => {
          if (order.side === "BUY" && !order.filled) {
            const remainingSize = order.size - (order.filledSize || 0);
            totalUnlocked += order.price * remainingSize;
          }
        });
        
        if (totalUnlocked > 0) {
          const currentLocked = prev.lockedBalance || 0;
          const newLocked = Math.max(0, currentLocked - totalUnlocked);
          const newAvailable = prev.balance - newLocked;
          const updated = {
            ...prev,
            lockedBalance: newLocked,
            availableBalance: Math.max(0, newAvailable),
          };
          performanceRef.current = updated;
          return updated;
        }
        return prev;
      });
    }

    // Place new orders if we're within position limits
    const newOrders: MarketMakerOrder[] = [];

    // DUAL ASSET MARKET MAKING:
    // For binary markets (YES/NO), we place orders on BOTH assets:
    // - YES side (upAssetId): BUY YES and SELL YES
    // - NO side (downAssetId): BUY NO and SELL NO
    
    // Time-aware order size adjustment
    const adjustedOrderSize = configRef.current.orderSize * timeAdjustments.orderSizeMultiplier;

    // ===== YES SIDE ORDERS (upAssetId) =====
    // Place YES bid if we're not at max long position
    if (currentInventory < maxPos) {
      // Check if we already have a YES BUY order at this price (deduplication)
      const existingYesBidOrder = ordersRef.current.find(
        o => o.side === "BUY" && 
        o.assetId === upAssetId &&
        Math.abs(o.price - yesBidPrice) < configRef.current.tickSize &&
        !o.filled
      );
      
      if (!existingYesBidOrder) {
        const yesBidOrder = placeOrder("BUY", yesBidPrice, adjustedOrderSize, upAssetId);
        newOrders.push(yesBidOrder);
        console.log("Placed YES BUY order:", { 
          price: yesBidPrice, 
          size: adjustedOrderSize, 
          midPrice: yesMidPrice,
          assetId: upAssetId,
          timeAdjustments: {
            spreadMultiplier: timeAdjustments.spreadMultiplier,
            orderSizeMultiplier: timeAdjustments.orderSizeMultiplier,
            minutesRemaining: timeAdjustments.minutesRemaining?.toFixed(1),
          }
        });
      }
    } else {
      console.log("Skipped YES BUY order: inventory limit", { currentInventory, maxPos });
    }

    // Place YES ask if we're not at max short position
    if (currentInventory > -maxPos) {
      // Check if we already have a YES SELL order at this price (deduplication)
      const existingYesAskOrder = ordersRef.current.find(
        o => o.side === "SELL" && 
        o.assetId === upAssetId &&
        Math.abs(o.price - yesAskPrice) < configRef.current.tickSize &&
        !o.filled
      );
      
      if (!existingYesAskOrder) {
        const yesAskOrder = placeOrder("SELL", yesAskPrice, adjustedOrderSize, upAssetId);
        newOrders.push(yesAskOrder);
        console.log("Placed YES SELL order:", { 
          price: yesAskPrice, 
          size: adjustedOrderSize, 
          midPrice: yesMidPrice,
          assetId: upAssetId,
          timeAdjustments: {
            spreadMultiplier: timeAdjustments.spreadMultiplier,
            orderSizeMultiplier: timeAdjustments.orderSizeMultiplier,
            minutesRemaining: timeAdjustments.minutesRemaining?.toFixed(1),
          }
        });
      }
    } else {
      console.log("Skipped YES SELL order: inventory limit", { currentInventory, maxPos });
    }

    // ===== NO SIDE ORDERS (downAssetId) =====
    // For NO side, we also place both BUY and SELL orders
    // Note: NO side inventory works inversely (BUY NO = -inventory, SELL NO = +inventory)
    // But we still want to place orders on both sides for market making
    // IMPORTANT: NO orders use NO mid price, not YES mid price
    
    // Place NO bid if we're not at max long position (same inventory check)
    if (currentInventory < maxPos) {
      // Check if we already have a NO BUY order at this price (deduplication)
      const existingNoBidOrder = ordersRef.current.find(
        o => o.side === "BUY" && 
        o.assetId === downAssetId &&
        Math.abs(o.price - noBidPrice) < configRef.current.tickSize &&
        !o.filled
      );
      
      if (!existingNoBidOrder) {
        const noBidOrder = placeOrder("BUY", noBidPrice, adjustedOrderSize, downAssetId);
        newOrders.push(noBidOrder);
        console.log("[NO Side] Placed NO BUY order:", { 
          price: noBidPrice, 
          size: adjustedOrderSize, 
          midPrice: noMidPrice,
          assetId: downAssetId,
          timeAdjustments: {
            spreadMultiplier: timeAdjustments.spreadMultiplier,
            orderSizeMultiplier: timeAdjustments.orderSizeMultiplier,
            minutesRemaining: timeAdjustments.minutesRemaining?.toFixed(1),
          }
        });
      }
    } else {
      console.log("Skipped NO BUY order: inventory limit", { currentInventory, maxPos });
    }

    // Place NO ask if we're not at max short position (same inventory check)
    if (currentInventory > -maxPos) {
      // Check if we already have a NO SELL order at this price (deduplication)
      const existingNoAskOrder = ordersRef.current.find(
        o => o.side === "SELL" && 
        o.assetId === downAssetId &&
        Math.abs(o.price - noAskPrice) < configRef.current.tickSize &&
        !o.filled
      );
      
      if (!existingNoAskOrder) {
        const noAskOrder = placeOrder("SELL", noAskPrice, adjustedOrderSize, downAssetId);
        newOrders.push(noAskOrder);
        console.log("[NO Side] Placed NO SELL order:", { 
          price: noAskPrice, 
          size: adjustedOrderSize, 
          midPrice: noMidPrice,
          assetId: downAssetId,
          timeAdjustments: {
            spreadMultiplier: timeAdjustments.spreadMultiplier,
            orderSizeMultiplier: timeAdjustments.orderSizeMultiplier,
            minutesRemaining: timeAdjustments.minutesRemaining?.toFixed(1),
          }
        });
      }
    } else {
      console.log("Skipped NO SELL order: inventory limit", { currentInventory, maxPos });
    }
    
    console.log("Rebalance complete:", { newOrders: newOrders.length, currentInventory, maxPos });

    setOrders((prev) => {
      // Remove filled orders and add new ones
      const activeOrders = prev.filter((o) => !o.filled);
      // Increased limit to 40 since we're placing orders on both YES and NO sides (4 orders per rebalance)
      const updated = [...activeOrders, ...newOrders].slice(0, 40); // Max 40 orders (20 per side)
      // Sync with ref
      ordersRef.current = updated;
      return updated;
    });
  }, [config, assetIds, getMidPrice, getNoMidPrice, placeOrder, getTimeBasedAdjustments]);

  // Track previous orderbook state to detect aggressive volume
  const prevOrderBookRef = useRef<{ bestBid: number | null; bestAsk: number | null }>({
    bestBid: null,
    bestAsk: null,
  });
  
  // Track aggressive volume at each price level
  // Fix Bug #2: Will reset periodically to prevent unbounded accumulation
  const aggressiveVolumeRef = useRef<Map<string, number>>(new Map()); // "side:price" -> volume
  const lastAggressiveVolumeResetRef = useRef<number>(0);
  
  // Track last processed trade to avoid duplicate fills
  const lastProcessedTradeRef = useRef<{ price: number; timestamp: number } | null>(null);
  
  // Track orderbook depth for queue calculation (from book snapshots)
  const orderbookQueueDepthRef = useRef<Map<string, number>>(new Map()); // "side:price" -> queue depth

  // Update orderbook queue depth when book snapshot arrives
  useEffect(() => {
    if (mode === "backtest" || !orderBook.bids || !orderBook.asks) return;
    
    // Calculate queue depth from orderbook for each price level
    const queueDepthMap = new Map<string, number>();
    
    // Process bids (BUY orders) - queue is sum of sizes at same or better prices
    orderBook.bids.forEach((bid, index) => {
      const price = parseFloat(bid.price);
      const size = parseFloat(bid.size);
      if (isNaN(price) || isNaN(size)) return;
      
      // Queue depth = sum of all sizes at this price and better prices (higher)
      let queueDepth = 0;
      for (let i = 0; i <= index; i++) {
        const levelSize = parseFloat(orderBook.bids[i].size);
        if (!isNaN(levelSize)) {
          queueDepth += levelSize;
        }
      }
      
      const key = `BUY:${price.toFixed(8)}`;
      queueDepthMap.set(key, queueDepth);
    });
    
    // Process asks (SELL orders) - queue is sum of sizes at same or better prices
    orderBook.asks.forEach((ask, index) => {
      const price = parseFloat(ask.price);
      const size = parseFloat(ask.size);
      if (isNaN(price) || isNaN(size)) return;
      
      // Queue depth = sum of all sizes at this price and better prices (lower)
      let queueDepth = 0;
      for (let i = 0; i <= index; i++) {
        const levelSize = parseFloat(orderBook.asks[i].size);
        if (!isNaN(levelSize)) {
          queueDepth += levelSize;
        }
      }
      
      const key = `SELL:${price.toFixed(8)}`;
      queueDepthMap.set(key, queueDepth);
    });
    
    orderbookQueueDepthRef.current = queueDepthMap;
  }, [orderBook.bids, orderBook.asks, mode]);

  // Check for order fills using queue-aware logic (aggressive volume hitting resting orders)
  // In backtest mode, this is called from the backtest loop, not on a timer
  const checkFills = useCallback(() => {
    // Fix issue #1: Use isBacktestingRef instead of config.enabled for backtest mode
    const isEnabled = isBacktestingRef.current ? true : config.enabled;
    if (!isEnabled) return;

    const activeOrders = ordersRef.current.filter((o) => !o.filled);
    const currentTime = isBacktestingRef.current ? simTimeRef.current : Date.now();
    
    // Debug logging
    if (testMode || process.env.NODE_ENV === 'development') {
      fillDebugLogRef.current.push({
        timestamp: currentTime,
        message: "checkFills called",
        data: { activeOrders: activeOrders.length, testMode }
      });
    }
    const activeOrderBook = mode === "backtest" && isBacktestingRef.current
      ? backtestOrderBook 
      : orderBook;
    const bestBid = activeOrderBook.bestBid ? parseFloat(activeOrderBook.bestBid) : null;
    const bestAsk = activeOrderBook.bestAsk ? parseFloat(activeOrderBook.bestAsk) : null;
    
    // Priority 2: Check for orderbook crossing (immediate fill if price crosses)
    const crossingFilledOrders = new Set<string>();
    activeOrders.forEach((order) => {
      if (order.filled) return;
      
      const orderPrice = order.price;
      const priceTolerance = orderPrice * 0.0001; // Very tight tolerance for crossing
      
      // BUY order crosses if price >= bestAsk
      if (order.side === "BUY" && bestAsk && orderPrice >= bestAsk - priceTolerance) {
        const remainingSize = order.size - (order.filledSize || 0);
        if (remainingSize > 0) {
          const fillPrice = order.price; // Fill at our resting price
          const feeBps = config.makerFee;
          const fees = (fillPrice * remainingSize * feeBps) / 10000;
          simulateFill(order, fillPrice, remainingSize, fees);
          crossingFilledOrders.add(order.id);
          
          if (testMode || process.env.NODE_ENV === 'development') {
            fillDebugLogRef.current.push({
              timestamp: currentTime,
              message: `CROSSING FILL: BUY order crossed bestAsk`,
              data: { orderId: order.id, orderPrice, bestAsk, fillSize: remainingSize }
            });
          }
        }
      }
      
      // SELL order crosses if price <= bestBid
      if (order.side === "SELL" && bestBid && orderPrice <= bestBid + priceTolerance) {
        const remainingSize = order.size - (order.filledSize || 0);
        if (remainingSize > 0) {
          const fillPrice = order.price; // Fill at our resting price
          const feeBps = config.makerFee;
          const fees = (fillPrice * remainingSize * feeBps) / 10000;
          simulateFill(order, fillPrice, remainingSize, fees);
          crossingFilledOrders.add(order.id);
          
          if (testMode || process.env.NODE_ENV === 'development') {
            fillDebugLogRef.current.push({
              timestamp: currentTime,
              message: `CROSSING FILL: SELL order crossed bestBid`,
              data: { orderId: order.id, orderPrice, bestBid, fillSize: remainingSize }
            });
          }
        }
      }
    });
    
    // Filter out orders that just got filled from crossing (skip them in aggressive volume logic)
    const remainingOrders = activeOrders.filter((o) => {
      const remainingSize = o.size - (o.filledSize || 0);
      return remainingSize > 0 && !o.filled && !crossingFilledOrders.has(o.id);
    });

    // Fix Bug #9: Initialize prevOrderBookRef if not set
    if (prevOrderBookRef.current.bestBid === null && bestBid !== null) {
      prevOrderBookRef.current.bestBid = bestBid;
    }
    if (prevOrderBookRef.current.bestAsk === null && bestAsk !== null) {
      prevOrderBookRef.current.bestAsk = bestAsk;
    }

    // Fix Bug #2: Reset aggressive volume periodically (every 60 seconds) to prevent unbounded accumulation
    // currentTime already declared above, reuse it
    const timeSinceReset = currentTime - lastAggressiveVolumeResetRef.current;
    if (timeSinceReset > 60000) { // Reset every 60 seconds
      aggressiveVolumeRef.current.clear();
      lastAggressiveVolumeResetRef.current = currentTime;
    }

    // Detect aggressive volume from price movements
    const prev = prevOrderBookRef.current;
    
    // Fix Bug #6: Track if we've already processed price movements to prevent double-counting
    let priceMovementProcessed = false;
    
    // If best bid moved up, aggressive BUY orders consumed ASK side (hit resting SELL orders)
    // Fix Bug #3: Better price estimation - use actual ask prices from orderbook or active orders
    if (bestBid && prev.bestBid && bestBid > prev.bestBid && !priceMovementProcessed) {
      priceMovementProcessed = true;
      
      // Fix Bug #3: Find actual ask prices that were likely hit
      // Prefer: current bestAsk, previous bestAsk, or midpoint
      let hitPrice = bestAsk || prev.bestAsk;
      if (!hitPrice) {
        // Fallback: estimate between old bid and new bid (conservative)
        hitPrice = (prev.bestBid + bestBid) / 2;
      }
      
      // Fix Bug #8: Distribute volume to nearby price levels (orders at similar prices)
      const priceMove = bestBid - prev.bestBid;
      const VOLUME_MULTIPLIER = 100;
      const estimatedVol = Math.max(config.orderSize * 0.5, priceMove * VOLUME_MULTIPLIER);
      
      // Distribute to actual order prices nearby (within 0.1% tolerance)
      const priceTolerance = hitPrice * 0.001; // 0.1% tolerance
      const nearbySellOrders = activeOrders.filter(
        o => o.side === "SELL" && Math.abs(o.price - hitPrice) <= priceTolerance
      );
      
      if (nearbySellOrders.length > 0) {
        // Distribute volume proportionally to nearby orders
        const totalSize = nearbySellOrders.reduce((sum, o) => sum + (o.size - (o.filledSize || 0)), 0);
        nearbySellOrders.forEach(order => {
          const orderKey = `SELL:${order.price.toFixed(8)}`;
          const currentVol = aggressiveVolumeRef.current.get(orderKey) || 0;
          const orderSize = order.size - (order.filledSize || 0);
          const allocatedVol = totalSize > 0 ? (estimatedVol * orderSize) / totalSize : estimatedVol / nearbySellOrders.length;
          aggressiveVolumeRef.current.set(orderKey, currentVol + allocatedVol);
          
          if (testMode || process.env.NODE_ENV === 'development') {
            fillDebugLogRef.current.push({
              timestamp: currentTime,
              message: "Aggressive BUY volume detected - distributed to SELL orders",
              data: { hitPrice, orderPrice: order.price, allocatedVol, totalEstimatedVol: estimatedVol }
            });
          }
        });
      } else {
        // No nearby orders, store at estimated price
        const key = `SELL:${hitPrice.toFixed(8)}`;
        const currentVol = aggressiveVolumeRef.current.get(key) || 0;
        aggressiveVolumeRef.current.set(key, currentVol + estimatedVol);
        
        if (testMode || process.env.NODE_ENV === 'development') {
          fillDebugLogRef.current.push({
            timestamp: currentTime,
            message: "Aggressive BUY volume detected - stored at estimated price (no nearby orders)",
            data: { hitPrice, estimatedVol }
          });
        }
      }
    }
    
    // If best ask moved down, aggressive SELL orders consumed BID side (hit resting BUY orders)
    // Fix Bug #3: Better price estimation
    if (bestAsk && prev.bestAsk && bestAsk < prev.bestAsk && !priceMovementProcessed) {
      priceMovementProcessed = true;
      
      // Fix Bug #3: Find actual bid prices that were likely hit
      let hitPrice = bestBid || prev.bestBid;
      if (!hitPrice) {
        hitPrice = (prev.bestAsk + bestAsk) / 2;
      }
      
      // Fix Bug #8: Use actual size from price_change if available, otherwise estimate
      const priceMove = prev.bestAsk - bestAsk;
      // Use actual size from orderbook changes if available, otherwise estimate conservatively
      // Reduced multiplier from 100 to 50 for more conservative estimation
      const VOLUME_MULTIPLIER = 50;
      const estimatedVol = Math.max(config.orderSize * 0.5, priceMove * VOLUME_MULTIPLIER);
      
      const priceTolerance = hitPrice * 0.001; // 0.1% tolerance
      const nearbyBuyOrders = activeOrders.filter(
        o => o.side === "BUY" && Math.abs(o.price - hitPrice) <= priceTolerance
      );
      
      if (nearbyBuyOrders.length > 0) {
        const totalSize = nearbyBuyOrders.reduce((sum, o) => sum + (o.size - (o.filledSize || 0)), 0);
        nearbyBuyOrders.forEach(order => {
          const orderKey = `BUY:${order.price.toFixed(8)}`;
          const currentVol = aggressiveVolumeRef.current.get(orderKey) || 0;
          const orderSize = order.size - (order.filledSize || 0);
          const allocatedVol = totalSize > 0 ? (estimatedVol * orderSize) / totalSize : estimatedVol / nearbyBuyOrders.length;
          aggressiveVolumeRef.current.set(orderKey, currentVol + allocatedVol);
          
          if (testMode || process.env.NODE_ENV === 'development') {
            fillDebugLogRef.current.push({
              timestamp: currentTime,
              message: "Aggressive SELL volume detected - distributed to BUY orders",
              data: { hitPrice, orderPrice: order.price, allocatedVol, totalEstimatedVol: estimatedVol }
            });
          }
        });
      } else {
        const key = `BUY:${hitPrice.toFixed(8)}`;
        const currentVol = aggressiveVolumeRef.current.get(key) || 0;
        aggressiveVolumeRef.current.set(key, currentVol + estimatedVol);
        
        if (testMode || process.env.NODE_ENV === 'development') {
          fillDebugLogRef.current.push({
            timestamp: currentTime,
            message: "Aggressive SELL volume detected - stored at estimated price (no nearby orders)",
            data: { hitPrice, estimatedVol }
          });
        }
      }
    }
    
    // Fix Bug #6: Only detect crossing if price movements haven't been processed
    // This prevents double-counting when both bid moves up AND ask moves down
    if (bestBid && bestAsk && bestBid >= bestAsk && !priceMovementProcessed) {
      // Aggressive orders are crossing - both sides get hit
      const crossingVol = config.orderSize * 2;
      
      // Distribute to actual order prices
      const askTolerance = bestAsk * 0.001;
      const bidTolerance = bestBid * 0.001;
      
      const nearbySellOrders = activeOrders.filter(
        o => o.side === "SELL" && Math.abs(o.price - bestAsk) <= askTolerance
      );
      const nearbyBuyOrders = activeOrders.filter(
        o => o.side === "BUY" && Math.abs(o.price - bestBid) <= bidTolerance
      );
      
      if (nearbySellOrders.length > 0) {
        nearbySellOrders.forEach(order => {
          const orderKey = `SELL:${order.price.toFixed(8)}`;
          const currentVol = aggressiveVolumeRef.current.get(orderKey) || 0;
          aggressiveVolumeRef.current.set(orderKey, currentVol + crossingVol / nearbySellOrders.length);
        });
      } else {
        const askKey = `SELL:${bestAsk.toFixed(8)}`;
        const currentAskVol = aggressiveVolumeRef.current.get(askKey) || 0;
        aggressiveVolumeRef.current.set(askKey, currentAskVol + crossingVol);
      }
      
      if (nearbyBuyOrders.length > 0) {
        nearbyBuyOrders.forEach(order => {
          const orderKey = `BUY:${order.price.toFixed(8)}`;
          const currentVol = aggressiveVolumeRef.current.get(orderKey) || 0;
          aggressiveVolumeRef.current.set(orderKey, currentVol + crossingVol / nearbyBuyOrders.length);
        });
      } else {
        const bidKey = `BUY:${bestBid.toFixed(8)}`;
        const currentBidVol = aggressiveVolumeRef.current.get(bidKey) || 0;
        aggressiveVolumeRef.current.set(bidKey, currentBidVol + crossingVol);
      }
    }
    
    // Update previous state
    prevOrderBookRef.current = { bestBid, bestAsk };

    // Fix Bug #5 & #7: Process fills in timestamp order to avoid race conditions
    // Sort orders by timestamp (oldest first) so queue calculations are correct
    // Use remainingOrders (excludes crossing-filled orders)
    const sortedOrders = [...remainingOrders].sort((a, b) => a.timestamp - b.timestamp);
    
    // Track consumed volume per price level to prevent double-filling
    const consumedVolumeMap = new Map<string, number>(); // "side:price" -> consumed volume
    
    // Process fills for each active order using queue-aware logic
    sortedOrders.forEach((order) => {
      // Fix Bug #4: Check for aggressive volume at exact price OR nearby prices (within tolerance)
      const priceTolerance = order.price * 0.001; // 0.1% tolerance
      const orderKey = `${order.side}:${order.price.toFixed(8)}`;
      
      // First check exact price match
      let aggressiveVol = aggressiveVolumeRef.current.get(orderKey) || 0;
      let volumeKey = orderKey;
      
      // Fix Bug #4: If no exact match, check nearby prices
      if (aggressiveVol <= 0) {
        for (const [key, vol] of aggressiveVolumeRef.current.entries()) {
          if (key.startsWith(`${order.side}:`)) {
            const keyPrice = parseFloat(key.split(':')[1]);
            if (Math.abs(keyPrice - order.price) <= priceTolerance && vol > 0) {
              aggressiveVol = vol;
              volumeKey = key;
              break;
            }
          }
        }
      }
      
      // Get already consumed volume for this price level
      const consumedVol = consumedVolumeMap.get(volumeKey) || 0;
      const availableAggressiveVol = Math.max(0, aggressiveVol - consumedVol);
      
      if (testMode || process.env.NODE_ENV === 'development') {
        fillDebugLogRef.current.push({
          timestamp: currentTime,
          message: `Checking fill for ${order.side} order`,
          data: {
            orderId: order.id,
            orderPrice: order.price,
            orderKey,
            orderSize: order.size - (order.filledSize || 0),
            aggressiveVol,
            consumedVol,
            availableAggressiveVol,
            volumeKey,
            allAggressiveVolEntries: Array.from(aggressiveVolumeRef.current.entries()).map(([k, v]) => ({ key: k, vol: v }))
          }
        });
      }
      
      if (availableAggressiveVol <= 0) {
        // No aggressive volume available at this price level
        if (testMode || process.env.NODE_ENV === 'development') {
          fillDebugLogRef.current.push({
            timestamp: currentTime,
            message: `No aggressive volume for ${order.side} order at ${order.price.toFixed(4)}`,
            data: { 
              orderId: order.id,
              orderKey,
              searchedKey: orderKey,
              allAvailableKeys: Array.from(aggressiveVolumeRef.current.keys())
            }
          });
        }
        return;
      }
      
      // Fix Bug #5: Calculate queue position from sorted orders (already in timestamp order)
      // Only count orders that come BEFORE this one in the sorted list
      const orderIndex = sortedOrders.indexOf(order);
      const ordersAhead = sortedOrders.slice(0, orderIndex).filter(
        o => o.side === order.side && 
        Math.abs(o.price - order.price) < 0.0001 && // Same price
        !o.filled
      );
      
      // Calculate queue ahead: sum of remaining sizes of orders ahead
      const queueAhead = ordersAhead.reduce((sum, o) => {
        const remainingSize = o.size - (o.filledSize || 0);
        return sum + remainingSize;
      }, 0);
      
      // We fill when available aggressive volume >= queue ahead
      // This means aggressive orders have consumed all orders ahead of us
      if (testMode || process.env.NODE_ENV === 'development') {
        fillDebugLogRef.current.push({
          timestamp: currentTime,
          message: `Queue calculation for ${order.side} order`,
          data: {
            orderId: order.id,
            queueAhead,
            availableAggressiveVol,
            willFill: availableAggressiveVol >= queueAhead
          }
        });
      }
      
      if (availableAggressiveVol >= queueAhead) {
        // Calculate available aggressive volume for us
        const availableVol = availableAggressiveVol - queueAhead;
        const remainingSize = order.size - (order.filledSize || 0);
        const fillSize = Math.min(remainingSize, availableVol);
        
        if (fillSize > 0) {
          // Fix Bug #7: Consume volume BEFORE fill to prevent race condition
          const newConsumedVol = consumedVol + fillSize;
          consumedVolumeMap.set(volumeKey, newConsumedVol);
          
          // Update aggressive volume map
          const remainingAggressiveVol = aggressiveVol - newConsumedVol;
          if (remainingAggressiveVol > 0) {
            aggressiveVolumeRef.current.set(volumeKey, remainingAggressiveVol);
          } else {
            aggressiveVolumeRef.current.delete(volumeKey);
          }
          
          // Fill at our resting price (maker fill)
          const fillPrice = order.price;
          const feeBps = config.makerFee; // Always maker since we're resting
          const fees = (fillPrice * fillSize * feeBps) / 10000;
          
          if (testMode || process.env.NODE_ENV === 'development') {
            fillDebugLogRef.current.push({
              timestamp: currentTime,
              message: `FILL OCCURRED: ${order.side} order filled`,
              data: {
                orderId: order.id,
                fillPrice,
                fillSize,
                fees,
                remainingSize: remainingSize - fillSize
              }
            });
          }
          
          simulateFill(order, fillPrice, fillSize, fees);
        } else {
          if (testMode || process.env.NODE_ENV === 'development') {
            fillDebugLogRef.current.push({
              timestamp: currentTime,
              message: `Fill size calculated as 0 for ${order.side} order`,
              data: {
                orderId: order.id,
                availableVol,
                remainingSize,
                queueAhead
              }
            });
          }
        }
      } else {
        if (testMode || process.env.NODE_ENV === 'development') {
          fillDebugLogRef.current.push({
            timestamp: currentTime,
            message: `Not enough aggressive volume - still in queue`,
            data: {
              orderId: order.id,
              queueAhead,
              availableAggressiveVol,
              needed: queueAhead - availableAggressiveVol
            }
          });
        }
      }
    });
  }, [config.enabled, mode, orderBook, backtestOrderBook, simulateFill, config.orderSize, config.makerFee, testMode]);

  // Store checkFills in ref to avoid circular dependency
  useEffect(() => {
    checkFillsRef.current = checkFills;
  }, [checkFills]);

  // Test function: Force aggressive volume at all active order prices
  // Uses ref to avoid circular dependency with checkFills
  const testForceFills = useCallback(() => {
    const activeOrders = ordersRef.current.filter((o) => !o.filled);
    const currentTime = isBacktestingRef.current ? simTimeRef.current : Date.now();
    
    if (activeOrders.length === 0) {
      fillDebugLogRef.current.push({
        timestamp: currentTime,
        message: "TEST: No active orders to force fill",
        data: {}
      });
      return;
    }
    
    fillDebugLogRef.current.push({
      timestamp: currentTime,
      message: "TEST: Forcing aggressive volume at order prices",
      data: { orderCount: activeOrders.length }
    });
    
    // Clear any existing aggressive volume first to avoid confusion
    aggressiveVolumeRef.current.clear();
    
    activeOrders.forEach((order) => {
      const orderKey = `${order.side}:${order.price.toFixed(8)}`;
      const orderSize = order.size - (order.filledSize || 0);
      // Force aggressive volume equal to order size (guaranteed fill)
      // Use a large multiplier to ensure it exceeds queue requirements
      const forcedVolume = orderSize * 10; // 10x to ensure fill even with queue ahead
      aggressiveVolumeRef.current.set(orderKey, forcedVolume);
      
      fillDebugLogRef.current.push({
        timestamp: currentTime,
        message: `TEST: Added aggressive volume for ${order.side} at ${order.price.toFixed(4)}`,
        data: { 
          orderId: order.id, 
          volume: forcedVolume, 
          orderSize,
          orderKey,
          orderPrice: order.price
        }
      });
    });
    
    // Log all aggressive volume entries for verification
    fillDebugLogRef.current.push({
      timestamp: currentTime,
      message: "TEST: Aggressive volume map contents",
      data: { 
        entries: Array.from(aggressiveVolumeRef.current.entries()).map(([key, vol]) => ({ key, vol }))
      }
    });
    
    // Trigger fill check using ref to avoid circular dependency
    if (checkFillsRef.current) {
      // Small delay to ensure state is set
      setTimeout(() => {
        if (checkFillsRef.current) {
          checkFillsRef.current();
        }
      }, 10);
    }
  }, []); // No dependencies - uses ref instead

  // Only use timer for live mode
  useEffect(() => {
    if (!config.enabled || mode === "backtest") return;

    const interval = setInterval(checkFills, 1000); // Check every second
    return () => clearInterval(interval);
  }, [config.enabled, mode, checkFills]);

  // Track last rebalance time for simulated time-based rebalancing
  const lastRebalanceTimeRef = useRef<number>(0);

  // Rebalance based on simulated time (for backtest) or real time (for live)
  // Rebalance based on simulated time (for backtest) or real time (for live)
  // Time-aware: Adjust rebalance interval based on market phase
  const shouldRebalance = useCallback((): boolean => {
    if (!config.enabled) return false;
    
    const currentTime = isBacktestingRef.current ? simTimeRef.current : Date.now();
    const timeSinceLastRebalance = currentTime - lastRebalanceTimeRef.current;
    
    // Get time-based adjustments for rebalance interval
    const timeAdjustments = getTimeBasedAdjustments();
    const adjustedInterval = config.rebalanceInterval * timeAdjustments.rebalanceIntervalMultiplier;
    
    return timeSinceLastRebalance >= adjustedInterval;
  }, [config.enabled, config.rebalanceInterval, getTimeBasedAdjustments]);

  // Rebalance when needed (called from backtest loop or live timer)
  useEffect(() => {
    if (!config.enabled || mode === "backtest") return;

    // For live mode, use timer
    rebalanceOrders(); // Initial rebalance
    lastRebalanceTimeRef.current = Date.now();
    
    const interval = setInterval(() => {
      if (shouldRebalance()) {
        rebalanceOrders();
        lastRebalanceTimeRef.current = Date.now();
      }
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [config.enabled, mode, rebalanceOrders, shouldRebalance]);

  // Generate synthetic historical orderbook data with regime switches, jumps, and liquidity droughts
  const generateBacktestData = useCallback((durationMinutes: number = 15, steps: number = 60) => {
    const data: Array<{ timestamp: number; bestBid: number; bestAsk: number }> = [];
    const startPrice = 0.5; // Start at 50 cents (50% probability)
    const stepSize = durationMinutes * 60 * 1000 / steps; // Time per step in ms
    
    let currentPrice = startPrice;
    // Use a fixed start time for reproducible backtests
    const startTime = 1000000000000; // Fixed timestamp for consistency
    
    // Regime tracking
    type Regime = "normal" | "volatile" | "jump" | "drought";
    let currentRegime: Regime = "normal";
    let regimeDuration = 0;
    let regimeStartStep = 0;
    const regimeLengths = { normal: 20, volatile: 10, jump: 3, drought: 8 }; // steps per regime
    
    // Liquidity tracking
    let baseSpread = 0.001; // Base spread (0.1%)
    let liquidityMultiplier = 1.0; // Affects spread width
    
    // Fix issue #5: Use deterministic pseudo-random generator for reproducible backtests
    // Simple LCG (Linear Congruential Generator) with fixed seed
    // Must be defined BEFORE it's used in the loop
    let seed = 12345; // Fixed seed for determinism
    const deterministicRandom = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    
    for (let i = 0; i < steps; i++) {
      const stepInRegime = i - regimeStartStep;
      
      // Regime switching logic
      if (stepInRegime >= regimeLengths[currentRegime]) {
        // Switch to new regime
        const regimes: Regime[] = ["normal", "volatile", "jump", "drought"];
        // Weighted selection: more normal, occasional jumps/droughts
        // Fix issue #5: Use deterministic random
        const rand = deterministicRandom();
        if (rand < 0.5) {
          currentRegime = "normal";
        } else if (rand < 0.75) {
          currentRegime = "volatile";
        } else if (rand < 0.9) {
          currentRegime = "jump";
        } else {
          currentRegime = "drought";
        }
        regimeStartStep = i;
        regimeDuration = 0;
      }
      
      regimeDuration++;
      
      // Price movement based on regime
      let priceChange = 0;
      let spread = baseSpread;
      
      switch (currentRegime) {
        case "normal":
          // Normal random walk with mean reversion
          // Fix issue #5: Use deterministic random
          priceChange = (deterministicRandom() - 0.5) * 0.01; // ±0.5% max
          const meanReversion = (startPrice - currentPrice) * 0.05;
          priceChange += meanReversion;
          spread = baseSpread * (0.8 + deterministicRandom() * 0.4); // 0.08% to 0.12%
          liquidityMultiplier = 1.0;
          break;
          
        case "volatile":
          // High volatility regime
          priceChange = (deterministicRandom() - 0.5) * 0.03; // ±1.5% max
          spread = baseSpread * (1.2 + deterministicRandom() * 0.6); // 0.12% to 0.18%
          liquidityMultiplier = 0.8; // Slightly reduced liquidity
          break;
          
        case "jump":
          // Price jump event (news, oracle update, etc.)
          if (regimeDuration === 1) {
            // Single large jump at start of regime
            const jumpDirection = deterministicRandom() > 0.5 ? 1 : -1;
            priceChange = jumpDirection * (0.05 + deterministicRandom() * 0.1); // 5-15% jump
          } else {
            // Revert slightly after jump
            priceChange = (startPrice - currentPrice) * 0.2;
          }
          spread = baseSpread * (1.5 + deterministicRandom() * 1.0); // 0.15% to 0.25%
          liquidityMultiplier = 0.6; // Reduced liquidity during jumps
          break;
          
        case "drought":
          // Liquidity drought: wide spreads, low volume
          priceChange = (deterministicRandom() - 0.5) * 0.005; // Very small moves
          spread = baseSpread * (3.0 + deterministicRandom() * 2.0); // 0.3% to 0.5% (very wide)
          liquidityMultiplier = 0.3; // Severely reduced liquidity
          break;
      }
      
      currentPrice += priceChange;
      
      // Keep price in reasonable bounds (0.1 to 0.9)
      currentPrice = Math.max(0.1, Math.min(0.9, currentPrice));
      
      // Apply liquidity multiplier to spread
      spread = spread * liquidityMultiplier;
      
      // Ensure minimum spread
      spread = Math.max(spread, 0.0005); // At least 0.05%
      
      const bestBid = currentPrice - spread / 2;
      const bestAsk = currentPrice + spread / 2;
      
      data.push({
        timestamp: startTime + i * stepSize,
        bestBid: Math.max(0.01, bestBid),
        bestAsk: Math.min(0.99, bestAsk),
      });
    }
    
    return data;
  }, []);

  // Calculate risk metrics
  // Fix issue #11: Use refs consistently instead of state
  const calculateRiskMetrics = useCallback((perf: MarketMakerPerformance) => {
    const history = performanceHistoryRef.current;
    const currentTrades = tradesRef.current; // Use ref instead of state
    
    // Calculate max drawdown
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    let peak = perf.peakBalance;
    
    for (const point of history) {
      if (point.balance > peak) {
        peak = point.balance;
      }
      const drawdown = peak - point.balance;
      const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;
      
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
      if (drawdownPercent > maxDrawdownPercent) {
        maxDrawdownPercent = drawdownPercent;
      }
    }
    
    // Calculate Sharpe ratio (simplified)
    let sharpeRatio: number | null = null;
    if (history.length > 1) {
      const returns: number[] = [];
      for (let i = 1; i < history.length; i++) {
        const prevBalance = history[i - 1].balance;
        const currBalance = history[i].balance;
        if (prevBalance > 0) {
          returns.push((currBalance - prevBalance) / prevBalance);
        }
      }
      
      if (returns.length > 0) {
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        
        // Annualized Sharpe (assuming 1 minute = 1 period, 525600 minutes per year)
        if (stdDev > 0) {
          sharpeRatio = (avgReturn / stdDev) * Math.sqrt(525600);
        }
      }
    }
    
    // Calculate win rate using ref
    const winningTrades = currentTrades.filter((t) => (t.pnl || 0) > 0).length;
    const winRate = currentTrades.length > 0 ? (winningTrades / currentTrades.length) * 100 : 0;
    
    // Calculate risk of loss (probability of negative PnL)
    const negativePnLCount = history.filter((p) => p.totalPnL < 0).length;
    const riskOfLoss = history.length > 0 ? (negativePnLCount / history.length) * 100 : 0;
    
    // Calculate fill rate (from orders)
    const totalOrders = ordersRef.current.length;
    const filledOrders = ordersRef.current.filter((o) => o.filled).length;
    const fillRate = totalOrders > 0 ? (filledOrders / totalOrders) * 100 : 0;
    
    // Calculate average queue time (simplified - would come from backtest engine)
    const avgQueueTime = 0; // TODO: Track from backtest engine
    
    return {
      maxDrawdown,
      maxDrawdownPercent,
      sharpeRatio,
      winRate,
      riskOfLoss,
      peakBalance: peak,
      fillRate,
      avgQueueTime,
    };
  }, []); // Remove trades dependency - use ref instead

  // Reset all data
  const reset = useCallback(() => {
    const initialCapital = config.initialCapital || DEFAULT_CONFIG.initialCapital;
    setOrders([]);
    setTrades([]);
    setPerformance({
      totalPnL: 0,
      realizedPnL: 0,
      unrealizedPnL: 0,
      totalTrades: 0,
      buyTrades: 0,
      sellTrades: 0,
      spreadCaptured: 0,
      inventory: 0,
      balance: initialCapital,
      lockedBalance: 0,
      availableBalance: initialCapital,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: null,
      winRate: 0,
      riskOfLoss: 0,
      peakBalance: initialCapital,
      totalFees: 0,
      netPnL: 0,
      exposure: 0,
      maxExposure: 0,
      fillRate: 0,
      avgQueueTime: 0,
      orderBookValidationErrors: 0,
    });
    positionHistoryRef.current = [];
    ordersRef.current = [];
    tradesRef.current = []; // Fix issue #2: Reset tradesRef
    performanceHistoryRef.current = [];
    lastSnapshotTimeRef.current = 0; // Fix issue #12: Reset snapshot time
    // Fix Bug #2: Reset aggressive volume tracking
    aggressiveVolumeRef.current.clear();
    lastAggressiveVolumeResetRef.current = 0;
    // Fix Bug #9: Reset previous orderbook state
    prevOrderBookRef.current = { bestBid: null, bestAsk: null };
    performanceRef.current = {
      totalPnL: 0,
      realizedPnL: 0,
      unrealizedPnL: 0,
      totalTrades: 0,
      buyTrades: 0,
      sellTrades: 0,
      spreadCaptured: 0,
      inventory: 0,
      balance: initialCapital,
      lockedBalance: 0,
      availableBalance: initialCapital,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: null,
      winRate: 0,
      riskOfLoss: 0,
      peakBalance: initialCapital,
      totalFees: 0,
      netPnL: 0,
      exposure: 0,
      maxExposure: 0,
      fillRate: 0,
      avgQueueTime: 0,
      orderBookValidationErrors: 0,
    };
  }, [config.initialCapital]);

  // Backtest mode - time-driven from historical data
  const startBacktest = useCallback(async (durationMinutes: number = 15, speed: number = 1) => {
    if (isBacktestingRef.current) return;
    
    // Reset performance
    reset();
    
    // Use synthetic data for backtests - NO API CALLS
    // Websocket data is for live trading only, not for backtesting
    // Backtests use synthetic data to simulate various market conditions
    const historicalData = generateBacktestData(durationMinutes, durationMinutes * 4);
    
    backtestDataRef.current = historicalData;
    backtestIndexRef.current = 0;
    isBacktestingRef.current = true;
    setIsBacktesting(true);
    
    // Initialize simulated time from first data point
    if (historicalData.length > 0) {
      simTimeRef.current = historicalData[0].timestamp;
      lastSimTimeRef.current = simTimeRef.current;
      lastSnapshotTimeRef.current = simTimeRef.current; // Fix issue #12: Initialize snapshot time
      // Set lastRebalanceTime to 0 so first rebalance happens immediately
      lastRebalanceTimeRef.current = 0;
    }
    
    // Enable market maker for backtest (use ref to avoid triggering re-renders)
    configRef.current.enabled = true;
    setConfig((prev) => ({ ...prev, enabled: true }));

    // Process backtest step by step using simulated time
    const processBacktestStep = () => {
      if (!isBacktestingRef.current || backtestIndexRef.current >= backtestDataRef.current.length) {
        // Backtest complete
        isBacktestingRef.current = false;
        setIsBacktesting(false);
        configRef.current.enabled = false;
        setConfig((prev) => ({ ...prev, enabled: false }));
        
        // Fix issue #2: Use refs instead of stale state closures
        const finalPerf = performanceRef.current;
        const finalTrades = tradesRef.current; // Use ref instead of stale state
        const finalConfig = configRef.current; // Use ref instead of stale state
        const riskMetrics = calculateRiskMetrics(finalPerf);
        
        // NOTE: Backtest results are stored in component state only
        // If you need persistence, use a server action or direct DB write function
        // Removed API call to reduce unnecessary network requests
        // Data is available in component state: finalPerf, finalTrades, riskMetrics
        console.log("Backtest completed:", {
          durationMinutes,
          totalPnL: finalPerf.totalPnL,
          totalTrades: finalPerf.totalTrades,
          finalBalance: finalPerf.balance,
        });
        
        return;
      }

      const data = backtestDataRef.current[backtestIndexRef.current];
      
      // Update simulated time from historical data
      simTimeRef.current = data.timestamp;
      
      // Update simulated orderbook
      setBacktestOrderBook({
        bestBid: data.bestBid.toFixed(8),
        bestAsk: data.bestAsk.toFixed(8),
        bids: [{ price: data.bestBid.toFixed(8), size: "100" }],
        asks: [{ price: data.bestAsk.toFixed(8), size: "100" }],
      });

      // Check for fills at this time step
      checkFills();

      // Check if we should rebalance based on simulated time
      // Force first rebalance immediately after orderbook is set
      const shouldRebalanceNow = backtestIndexRef.current === 0 || shouldRebalance();
      if (shouldRebalanceNow) {
        // console.log("Backtest rebalancing at step", backtestIndexRef.current, {
        //   simTime: simTimeRef.current,
        //   lastRebalance: lastRebalanceTimeRef.current,
        //   midPrice: getMidPrice(),
        // });
        rebalanceOrders();
        lastRebalanceTimeRef.current = simTimeRef.current;
      }

      // Fix issue #12: Take snapshot every 5 seconds of simulated time (not per fill)
      // Use separate ref to track snapshot timing to avoid double counting
      const timeSinceLastSnapshot = simTimeRef.current - lastSnapshotTimeRef.current;
      if (timeSinceLastSnapshot >= 5000) {
        const perf = performanceRef.current;
        // Fix issue #3: Use consistent totalPnL calculation
        const currentTotalPnL = perf.realizedPnL + perf.unrealizedPnL;
        performanceHistoryRef.current.push({
          timestamp: simTimeRef.current,
          balance: perf.balance,
          totalPnL: currentTotalPnL, // Use consistent calculation
        });
        
        // Keep last 10000 snapshots
        if (performanceHistoryRef.current.length > 10000) {
          performanceHistoryRef.current.shift();
        }
        
        lastSnapshotTimeRef.current = simTimeRef.current;
      }

      // Move to next data point
      backtestIndexRef.current++;
      
      // Schedule next step based on speed (but using real time for UI updates)
      // The actual simulation time comes from historical data
      if (speed > 0) {
        const realTimeDelay = Math.max(1, 1000 / speed);
        requestAnimationFrame(() => {
          setTimeout(processBacktestStep, realTimeDelay);
        });
      } else {
        // Instant mode - process all at once
        processBacktestStep();
      }
    };

    // Start processing
    processBacktestStep();
  }, [assetIds, generateBacktestData, reset, config, calculateRiskMetrics, trades, checkFills, shouldRebalance, rebalanceOrders]);

  const stopBacktest = useCallback(() => {
    isBacktestingRef.current = false;
    setIsBacktesting(false);
    setConfig((prev) => ({ ...prev, enabled: false }));
    simTimeRef.current = 0;
    lastSimTimeRef.current = 0;
  }, []);

  // Calculate unrealized PnL (DUAL ASSET - YES and NO positions calculated separately)
  useEffect(() => {
    const activeOrderBook = mode === "backtest" && isBacktesting 
      ? backtestOrderBook 
      : orderBook;
      
    if (!activeOrderBook.bestBid || !activeOrderBook.bestAsk) return;

    const yesMidPrice = getMidPrice();
    if (!yesMidPrice) return;

    // Get NO mid price (for dual-asset markets)
    const noMidPrice = getNoMidPrice();
    
    const positionHistory = positionHistoryRef.current;
    const upAssetId = assetIds?.[0];
    const downAssetId = assetIds?.[1];
    
    // Separate YES and NO positions and calculate net inventory for each
    let yesTotalCost = 0;
    let yesTotalSize = 0; // Net YES position (positive = long, negative = short)
    let noTotalCost = 0;
    let noTotalSize = 0; // Net NO position (positive = long, negative = short)
    
    positionHistory.forEach((pos) => {
      const isYesAsset = pos.assetId === upAssetId;
      
      if (isYesAsset) {
        // YES asset: BUY = +, SELL = -
        if (pos.side === "BUY") {
          yesTotalCost += pos.price * pos.size;
          yesTotalSize += pos.size;
        } else {
          yesTotalCost -= pos.price * pos.size;
          yesTotalSize -= pos.size;
        }
      } else if (pos.assetId === downAssetId) {
        // NO asset: BUY NO = long NO, SELL NO = short NO
        // Note: In terms of YES inventory, BUY NO = -YES, SELL NO = +YES
        // But for NO unrealized PnL, we calculate it directly using NO prices
        if (pos.side === "BUY") {
          noTotalCost += pos.price * pos.size;
          noTotalSize += pos.size;
        } else {
          noTotalCost -= pos.price * pos.size;
          noTotalSize -= pos.size;
        }
      }
    });
    
    // Calculate average entry prices for YES and NO positions separately
    const yesAvgEntryPrice = yesTotalSize !== 0 ? yesTotalCost / yesTotalSize : yesMidPrice;
    const noAvgEntryPrice = noTotalSize !== 0 ? noTotalCost / noTotalSize : (noMidPrice || (1 - yesMidPrice));
    
    // Calculate unrealized PnL for YES positions using YES mid price
    const unrealizedPnL_YES = yesTotalSize * (yesMidPrice - yesAvgEntryPrice);
    
    // Calculate unrealized PnL for NO positions using NO mid price
    // If NO mid price is not available (e.g., in backtest), use 1 - YES mid price
    const noMid = noMidPrice || (1 - yesMidPrice);
    const unrealizedPnL_NO = noTotalSize * (noMid - noAvgEntryPrice);
    
    // Combined unrealized PnL
    const unrealizedPnL = unrealizedPnL_YES + unrealizedPnL_NO;
    
    // Fix issue #3: Single source of truth for PnL calculation
    const updatedPerf = {
      ...performanceRef.current,
      unrealizedPnL,
      totalPnL: performanceRef.current.realizedPnL + unrealizedPnL, // totalPnL = realized + unrealized
      netPnL: (performanceRef.current.realizedPnL + unrealizedPnL) - performanceRef.current.totalFees, // netPnL = totalPnL - fees
    };
    
    // Update peak balance
    if (updatedPerf.balance > updatedPerf.peakBalance) {
      updatedPerf.peakBalance = updatedPerf.balance;
    }
    
    // Calculate risk metrics
    const riskMetrics = calculateRiskMetrics(updatedPerf);
    
    setPerformance({
      ...updatedPerf,
      ...riskMetrics,
    });
  }, [orderBook, backtestOrderBook, mode, getMidPrice, getNoMidPrice, calculateRiskMetrics, assetIds]);

  // Periodic snapshots for P&L chart (every 5 seconds in live mode)
  useEffect(() => {
    if (mode !== "live" || !config.enabled) return;

    const snapshotInterval = setInterval(() => {
      const currentPerf = performanceRef.current;
      const currentTime = Date.now();
      
      // Add snapshot with full P&L data (including unrealized)
      performanceHistoryRef.current.push({
        timestamp: currentTime,
        balance: currentPerf.balance,
        totalPnL: currentPerf.totalPnL,
        realizedPnL: currentPerf.realizedPnL,
        unrealizedPnL: currentPerf.unrealizedPnL,
        inventory: currentPerf.inventory,
      });
      
      // Keep only last 2 hours of snapshots (720 snapshots at 5s intervals)
      const twoHoursAgo = currentTime - 2 * 60 * 60 * 1000;
      performanceHistoryRef.current = performanceHistoryRef.current.filter(
        snap => snap.timestamp > twoHoursAgo
      );
      
      // Trigger re-render for chart updates
      setPerformanceHistoryVersion(prev => prev + 1);
    }, 5000); // Every 5 seconds

    return () => clearInterval(snapshotInterval);
  }, [mode, config.enabled]);

  // Update balance when initial capital changes
  useEffect(() => {
    if (!config.enabled && !isBacktesting) {
      setPerformance((prev) => ({
        ...prev,
        balance: config.initialCapital,
        peakBalance: config.initialCapital,
      }));
      performanceRef.current = {
        ...performanceRef.current,
        balance: config.initialCapital,
        peakBalance: config.initialCapital,
      };
    }
  }, [config.initialCapital, config.enabled, isBacktesting]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rebalanceTimerRef.current) {
        clearInterval(rebalanceTimerRef.current);
      }
    };
  }, []);

    // Calculate actual spread being used (in bps) - updates in real-time
    const actualSpreadBps = useMemo(() => {
      if (config.useAdaptiveController && controllerSpread !== null && controllerSpread > 0) {
        const yesMid = getMidPrice();
        if (yesMid) {
          return (controllerSpread / yesMid) * 10000;
        }
      }
      return config.spreadBps;
    }, [config.useAdaptiveController, config.spreadBps, controllerSpread, getMidPrice]);

    return {
    config,
    setConfig,
    orders,
    trades,
    performance,
    isConnected,
    startBacktest,
    stopBacktest,
    rebalanceOrders,
    reset,
    isBacktesting,
    backtestOrderBook: mode === "backtest" ? backtestOrderBook : null,
    // Test utilities
    testMode,
    setTestMode,
    testForceFills,
    fillDebugLog: fillDebugLogRef.current.slice(-50), // Last 50 log entries
    clearFillDebugLog: () => { fillDebugLogRef.current = []; },
    // Adaptive controller output (for UI display)
    adaptiveControllerOutput: controllerOutputRef.current,
    // Actual spread being used (in bps) - updates in real-time
    actualSpreadBps,
    // Performance history for P&L chart (includes unrealized P&L snapshots)
    // Note: Use performanceHistoryVersion as dependency to trigger updates
    performanceHistory: performanceHistoryRef.current,
    performanceHistoryVersion, // Version counter to trigger chart updates
  };
}

