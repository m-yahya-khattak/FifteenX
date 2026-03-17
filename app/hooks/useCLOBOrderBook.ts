"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { isMainAppPaused } from "../lib/appConfig";
import { useSharedCLOBWebSocket } from "./useSharedCLOBWebSocket";

interface OrderLevel {
  price: string;
  size: string;
}

// Configuration constants - Optimized to match Polymarket UX
const MIN_ORDER_VALUE = 5; // Minimum order value in USD to display
const PRICE_LEVEL_INCREMENT = 0.1; // Price level granularity for aggregation
const SMOOTHING_WINDOW_SIZE = 20; // Number of recent prices for moving average (increased for stability)
const UI_UPDATE_THROTTLE_MS = 300; // Throttle React state updates to 300ms (slower, more stable)
const PRICE_UPDATE_THROTTLE_MS = 1000; // Separate throttle for price updates (1 second - much slower for buttons)
const PRICE_CHANGE_THRESHOLD = 0.2; // Only update if price changes by 0.2% (reduces flicker significantly)
const MIN_PRICE_UPDATE_INTERVAL_MS = 5000; // Minimum time between price updates (even if threshold met)
const EXPONENTIAL_SMOOTHING_ALPHA = 0.8; // Exponential smoothing factor (0.08 = 92% old, 8% new - very heavy smoothing)
const BUTTON_PRICE_SMOOTHING_WINDOW = 40; // Larger window specifically for button prices

// Capture historical data to database
async function captureHistoricalData(message: OrderBookMessage, assetIds: string[]) {
  try {
    let assetId: string | null = null;
    let market: string | null = null;
    let timestamp: number = Date.now();

    // Extract asset_id, market, and timestamp based on message type
    if (message.event_type === "book") {
      const bookMsg = message as BookMessage;
      assetId = bookMsg.asset_id;
      market = bookMsg.market;
      // Parse timestamp - could be string or number
      if (bookMsg.timestamp) {
        timestamp = typeof bookMsg.timestamp === "string" 
          ? parseInt(bookMsg.timestamp) 
          : bookMsg.timestamp;
      }
    } else if (message.event_type === "price_change") {
      const priceChangeMsg = message as PriceChangeMessage;
      market = priceChangeMsg.market;
      // Parse timestamp
      if (priceChangeMsg.timestamp) {
        timestamp = typeof priceChangeMsg.timestamp === "string"
          ? parseInt(priceChangeMsg.timestamp)
          : priceChangeMsg.timestamp;
      }
      // For price_change, capture each asset in price_changes
      if (priceChangeMsg.price_changes && priceChangeMsg.price_changes.length > 0) {
        // Capture each price change separately
        for (const change of priceChangeMsg.price_changes) {
          await fetch("/api/historical/capture", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              asset_id: change.asset_id,
              market: market,
              event_type: "price_change",
              timestamp: timestamp,
              message: change,
            }),
          });
        }
        return; // Already handled all price changes
      }
    } else if (message.event_type === "best_bid_ask") {
      const bestBidAskMsg = message as BestBidAskMessage;
      assetId = bestBidAskMsg.asset_id;
      market = bestBidAskMsg.market;
      // Parse timestamp
      if (bestBidAskMsg.timestamp) {
        timestamp = typeof bestBidAskMsg.timestamp === "string"
          ? parseInt(bestBidAskMsg.timestamp)
          : bestBidAskMsg.timestamp;
      }
    } else if (message.event_type === "last_trade_price") {
      const lastTradeMsg = message as LastTradePriceMessage;
      assetId = lastTradeMsg.asset_id;
      market = lastTradeMsg.market;
      // Parse timestamp
      if (lastTradeMsg.timestamp) {
        timestamp = typeof lastTradeMsg.timestamp === "string"
          ? parseInt(lastTradeMsg.timestamp)
          : lastTradeMsg.timestamp;
      }
    }

    // Only capture if we have asset_id and market
    if (assetId && market) {
      await fetch("/api/historical/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: assetId,
          market: market,
          event_type: message.event_type,
          timestamp: timestamp,
          message: message,
        }),
      });
    }
  } catch (error) {
    // Silently fail - don't interrupt normal operation
  }
}

interface BookMessage {
  event_type: "book";
  asset_id: string;
  market: string;
  timestamp: string;
  hash: string;
  bids: OrderLevel[];
  asks: OrderLevel[];
}

interface PriceChange {
  asset_id: string;
  price: string;
  size: string;
  side: "BUY" | "SELL";
  hash: string;
  best_bid: string;
  best_ask: string;
}

interface PriceChangeMessage {
  event_type: "price_change";
  market: string;
  price_changes: PriceChange[];
  timestamp: string;
}

interface BestBidAskMessage {
  event_type: "best_bid_ask";
  asset_id: string;
  market: string;
  best_bid: string;
  best_ask: string;
  timestamp: string;
}

interface LastTradePriceMessage {
  event_type: "last_trade_price";
  asset_id: string;
  market: string;
  price: string;
  side: "BUY" | "SELL";
  size: string;
  timestamp: string;
}

type OrderBookMessage = BookMessage | PriceChangeMessage | BestBidAskMessage | LastTradePriceMessage;

interface OrderBookState {
  bids: OrderLevel[];
  asks: OrderLevel[];
  bestBid: string | null;
  bestAsk: string | null;
  lastTradePrice: string | null;
  spread: string | null;
}

export function useCLOBOrderBook(assetIds: string[] | null) {
  // Use shared WebSocket connection instead of creating a new one
  // If assetIds is null or empty, pass null to shared hook (it handles this)
  // For single asset, use first asset as filter; for multiple, use first as filter (caller should handle multiple assets separately)
  const filterAssetId = assetIds && assetIds.length > 0 ? assetIds[0] : null;
  const { orderBook: rawOrderBook, isConnected: sharedIsConnected, connectionStatus: sharedConnectionStatus, lastTrade: sharedLastTrade } = useSharedCLOBWebSocket(
    assetIds,
    filterAssetId
  );

  // Apply smoothing, throttling, and filtering on top of shared orderbook
  const [orderBook, setOrderBook] = useState<OrderBookState>({
    bids: [],
    asks: [],
    bestBid: null,
    bestAsk: null,
    lastTradePrice: null,
    spread: null,
  });
  const [connectionStatus, setConnectionStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");
  const [rawMessages, setRawMessages] = useState<any[]>([]);
  const orderBookStateRef = useRef<OrderBookState>({
    bids: [],
    asks: [],
    bestBid: null,
    bestAsk: null,
    lastTradePrice: null,
    spread: null,
  });

  // Price smoothing: Keep history of recent prices for moving average
  const priceHistoryRef = useRef<{
    bestBid: number[];
    bestAsk: number[];
  }>({
    bestBid: [],
    bestAsk: [],
  });

  // Exponential smoothing: Track smoothed values
  const smoothedPriceRef = useRef<{
    bestBid: number | null;
    bestAsk: number | null;
  }>({
    bestBid: null,
    bestAsk: null,
  });

  // Throttling: Track last update time
  const lastUpdateTimeRef = useRef<number>(0);
  const lastPriceUpdateTimeRef = useRef<number>(0);
  const pendingUpdateRef = useRef<Partial<OrderBookState> | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const priceUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to calculate spread
  const calculateSpread = (bestBid: string | null, bestAsk: string | null): string | null => {
    if (!bestBid || !bestAsk) return null;
    const bid = parseFloat(bestBid);
    const ask = parseFloat(bestAsk);
    if (isNaN(bid) || isNaN(ask)) return null;
    const spreadValue = ask - bid;
    return spreadValue.toFixed(4);
  };

  // Price smoothing: Hybrid approach - Exponential smoothing + Moving average
  // Extra heavy smoothing for button prices to reduce flicker
  const smoothPrice = (price: number | null, type: "bid" | "ask"): number | null => {
    if (price === null || isNaN(price)) return null;

    const history = priceHistoryRef.current[type === "bid" ? "bestBid" : "bestAsk"];
    const smoothedRef = smoothedPriceRef.current[type === "bid" ? "bestBid" : "bestAsk"];
    
    // Add new price to history
    history.push(price);
    
    // Keep only last N prices (use larger window for button prices)
    const windowSize = BUTTON_PRICE_SMOOTHING_WINDOW;
    if (history.length > windowSize) {
      history.shift();
    }

    // Use exponential smoothing with very heavy smoothing (90% old, 10% new)
    let smoothed: number;
    if (smoothedRef === null) {
      // First value - use as-is
      smoothed = price;
    } else {
      // Exponential smoothing: new = alpha * current + (1 - alpha) * old
      // With alpha = 0.1, this means 90% old value, 10% new value
      smoothed = EXPONENTIAL_SMOOTHING_ALPHA * price + (1 - EXPONENTIAL_SMOOTHING_ALPHA) * smoothedRef;
    }

    // Also calculate moving average for additional stability
    if (history.length >= 5) {
      // Use longer window for moving average
      const recentHistory = history.slice(-windowSize);
      const sum = recentHistory.reduce((acc, p) => acc + p, 0);
      const movingAvg = sum / recentHistory.length;
      
      // Blend exponential smoothing (60%) with moving average (40%) for extra stability
      smoothed = 0.6 * smoothed + 0.4 * movingAvg;
    }

    // Update smoothed reference
    if (type === "bid") {
      smoothedPriceRef.current.bestBid = smoothed;
    } else {
      smoothedPriceRef.current.bestAsk = smoothed;
    }

    return smoothed;
  };

  // Check if price change is significant enough to update UI
  // For button prices, we want a higher threshold to reduce flicker
  const isPriceChangeSignificant = (oldPrice: number | null, newPrice: number | null): boolean => {
    if (oldPrice === null || newPrice === null) return true;
    const change = Math.abs(newPrice - oldPrice);
    const percentChange = change / oldPrice;
    
    // For button prices, require at least 0.1% change (increased from 0.01%)
    // This means prices need to move by at least 0.1% before updating the button
    return percentChange >= PRICE_CHANGE_THRESHOLD;
  };

  // Filter small orders: Remove orders below minimum value threshold
  const filterSmallOrders = (levels: OrderLevel[]): OrderLevel[] => {
    return levels.filter((level) => {
      const price = parseFloat(level.price);
      const size = parseFloat(level.size);
      if (isNaN(price) || isNaN(size)) return false;
      const value = price * size;
      return value >= MIN_ORDER_VALUE;
    });
  };

  // Aggregate price levels: Group orders by price increments
  const aggregatePriceLevels = (levels: OrderLevel[], side: "BUY" | "SELL"): OrderLevel[] => {
    const aggregated = new Map<string, number>();

    levels.forEach((level) => {
      const price = parseFloat(level.price);
      const size = parseFloat(level.size);
      if (isNaN(price) || isNaN(size)) return;

      // Round price to nearest increment
      const roundedPrice = Math.round(price / PRICE_LEVEL_INCREMENT) * PRICE_LEVEL_INCREMENT;
      const priceKey = roundedPrice.toFixed(4);

      // Sum sizes at this price level
      const currentSize = aggregated.get(priceKey) || 0;
      aggregated.set(priceKey, currentSize + size);
    });

    // Convert back to OrderLevel array
    const result: OrderLevel[] = Array.from(aggregated.entries()).map(([price, size]) => ({
      price,
      size: size.toFixed(2),
    }));

    // Sort: bids descending, asks ascending
    if (side === "BUY") {
      result.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
    } else {
      result.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    }

    return result;
  };

  // Helper to update a price level in the orderbook
  const updatePriceLevel = (
    levels: OrderLevel[],
    price: string,
    size: string,
    side: "BUY" | "SELL"
  ): OrderLevel[] => {
    const priceNum = parseFloat(price);
    const sizeNum = parseFloat(size);
    
    if (isNaN(priceNum) || isNaN(sizeNum)) return levels;

    // Remove existing level at this price
    let updated = levels.filter((level) => level.price !== price);

    // If size > 0, add/update the level
    if (sizeNum > 0) {
      updated.push({ price, size });
    }

    // Sort: bids descending, asks ascending
    if (side === "BUY") {
      updated.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
    } else {
      updated.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    }

    return updated;
  };

  // Throttled state update: Batch React state updates (for orderbook levels)
  const flushPendingUpdate = useCallback(() => {
    if (pendingUpdateRef.current) {
      const updates = pendingUpdateRef.current;
      
      // Apply updates to internal state
      orderBookStateRef.current = {
        ...orderBookStateRef.current,
        ...updates,
      };

      // Recalculate spread if best bid/ask changed
      if (updates.bestBid !== undefined || updates.bestAsk !== undefined) {
        orderBookStateRef.current.spread = calculateSpread(
          orderBookStateRef.current.bestBid,
          orderBookStateRef.current.bestAsk
        );
      }

      // Update React state
      setOrderBook({ ...orderBookStateRef.current });
      
      pendingUpdateRef.current = null;
      lastUpdateTimeRef.current = Date.now();
    }
    updateTimeoutRef.current = null;
  }, []);

  // Separate throttled update for prices only (slower)
  const flushPendingPriceUpdate = useCallback(() => {
    // Clear timeout reference first
    priceUpdateTimeoutRef.current = null;
    
    if (!pendingUpdateRef.current) {
      return;
    }
    
    const updates = { ...pendingUpdateRef.current };
    
    // Check if price changes are significant FIRST (before checking time)
    const currentBid = orderBookStateRef.current.bestBid ? parseFloat(orderBookStateRef.current.bestBid) : null;
    const currentAsk = orderBookStateRef.current.bestAsk ? parseFloat(orderBookStateRef.current.bestAsk) : null;
    
    const newBid = updates.bestBid ? parseFloat(updates.bestBid) : null;
    const newAsk = updates.bestAsk ? parseFloat(updates.bestAsk) : null;

    // Check if price changes are significant (0.2% threshold)
    const bidChanged = isPriceChangeSignificant(currentBid, newBid);
    const askChanged = isPriceChangeSignificant(currentAsk, newAsk);

    // If price didn't change significantly, don't update at all
    if (!bidChanged && !askChanged) {
      // Clear pending updates but don't update UI
      if (updates.bestBid !== undefined || updates.bestAsk !== undefined) {
        delete pendingUpdateRef.current.bestBid;
        delete pendingUpdateRef.current.bestAsk;
      }
      return;
    }

    // Price changed significantly - now check if enough time has passed
    const now = Date.now();
    const timeSinceLastUpdate = now - lastPriceUpdateTimeRef.current;
    
    // For significant changes, only enforce minimum interval (500ms), not full throttle
    // This allows significant price changes to update faster
    if (timeSinceLastUpdate < MIN_PRICE_UPDATE_INTERVAL_MS) {
      // Too soon - reschedule for when minimum interval passes
      const delay = MIN_PRICE_UPDATE_INTERVAL_MS - timeSinceLastUpdate;
      priceUpdateTimeoutRef.current = setTimeout(flushPendingPriceUpdate, delay);
      return;
    }

    // Enough time has passed AND price changed significantly - update now
    if (bidChanged && updates.bestBid !== undefined) {
      orderBookStateRef.current.bestBid = updates.bestBid;
    }
    if (askChanged && updates.bestAsk !== undefined) {
      orderBookStateRef.current.bestAsk = updates.bestAsk;
    }

    // Recalculate spread
    orderBookStateRef.current.spread = calculateSpread(
      orderBookStateRef.current.bestBid,
      orderBookStateRef.current.bestAsk
    );

    // Update React state
    setOrderBook({ ...orderBookStateRef.current });
    lastPriceUpdateTimeRef.current = Date.now();

    // Clear price updates from pending (keep other updates)
    if (updates.bestBid !== undefined || updates.bestAsk !== undefined) {
      delete pendingUpdateRef.current.bestBid;
      delete pendingUpdateRef.current.bestAsk;
    }
  }, []);

  // Update orderbook state with throttling and smoothing
  const updateOrderBook = useCallback((updates: Partial<OrderBookState>) => {
    const hasPriceUpdate = updates.bestBid !== undefined || updates.bestAsk !== undefined;
    const hasOrderbookUpdate = updates.bids !== undefined || updates.asks !== undefined || updates.lastTradePrice !== undefined;

    // Process price smoothing for best bid/ask (separate handling)
    if (hasPriceUpdate) {
      const priceUpdates: Partial<OrderBookState> = {};
      
      if (updates.bestBid !== undefined) {
        const rawBid = updates.bestBid ? parseFloat(updates.bestBid) : null;
        const smoothedBid = smoothPrice(rawBid, "bid");
        if (smoothedBid !== null) {
          priceUpdates.bestBid = smoothedBid.toFixed(8);
        }
      }

      if (updates.bestAsk !== undefined) {
        const rawAsk = updates.bestAsk ? parseFloat(updates.bestAsk) : null;
        const smoothedAsk = smoothPrice(rawAsk, "ask");
        if (smoothedAsk !== null) {
          priceUpdates.bestAsk = smoothedAsk.toFixed(8);
        }
      }

      // Merge price updates into pending
      pendingUpdateRef.current = {
        ...pendingUpdateRef.current,
        ...priceUpdates,
      };

      // Throttle price updates separately (slower) - ALWAYS schedule, never call directly
      // This ensures proper throttling even if multiple messages arrive quickly
      // Only schedule if no timeout is already pending
      if (!priceUpdateTimeoutRef.current) {
        const now = Date.now();
        const timeSinceLastPriceUpdate = now - lastPriceUpdateTimeRef.current;
        
        // For significant price changes, we only wait for minimum interval (500ms)
        // The significance check happens in flushPendingPriceUpdate
        // This allows significant changes to update faster while still preventing rapid updates
        const delay = Math.max(0, MIN_PRICE_UPDATE_INTERVAL_MS - timeSinceLastPriceUpdate);
        
        priceUpdateTimeoutRef.current = setTimeout(flushPendingPriceUpdate, delay);
      }
      // If timeout already exists, don't create another - let the existing one handle it
    }

    // Filter and aggregate order levels (separate handling)
    if (hasOrderbookUpdate) {
      const orderbookUpdates: Partial<OrderBookState> = {};

      if (updates.bids) {
        let processedBids = filterSmallOrders(updates.bids);
        processedBids = aggregatePriceLevels(processedBids, "BUY");
        orderbookUpdates.bids = processedBids;
      }

      if (updates.asks) {
        let processedAsks = filterSmallOrders(updates.asks);
        processedAsks = aggregatePriceLevels(processedAsks, "SELL");
        orderbookUpdates.asks = processedAsks;
      }

      if (updates.lastTradePrice !== undefined) {
        orderbookUpdates.lastTradePrice = updates.lastTradePrice;
      }

      // Merge orderbook updates into pending
      pendingUpdateRef.current = {
        ...pendingUpdateRef.current,
        ...orderbookUpdates,
      };

      // Throttle orderbook updates (faster than prices)
      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdateTimeRef.current;

      if (timeSinceLastUpdate >= UI_UPDATE_THROTTLE_MS) {
        flushPendingUpdate();
      } else {
        if (!updateTimeoutRef.current) {
          const delay = UI_UPDATE_THROTTLE_MS - timeSinceLastUpdate;
          updateTimeoutRef.current = setTimeout(flushPendingUpdate, delay);
        }
      }
    }
  }, [flushPendingUpdate, flushPendingPriceUpdate]); // Include both flush functions in deps

  // Map shared connection status to include "error" state
  useEffect(() => {
    if (sharedConnectionStatus === "connected") {
      setConnectionStatus("connected");
    } else if (sharedConnectionStatus === "connecting") {
      setConnectionStatus("connecting");
    } else {
      setConnectionStatus("disconnected");
    }
  }, [sharedConnectionStatus]);

  // Track previous rawOrderBook values for deep comparison
  const prevRawOrderBookRef = useRef<typeof rawOrderBook | null>(null);

  // Memoize a key that changes only when orderbook data actually changes
  const rawOrderBookKey = useMemo(() => {
    if (!rawOrderBook) return null;
    
    const prev = prevRawOrderBookRef.current;
    
    // Deep comparison - only create new key if values actually changed
    if (prev &&
        prev.bestBid === rawOrderBook.bestBid &&
        prev.bestAsk === rawOrderBook.bestAsk &&
        prev.lastTradePrice === rawOrderBook.lastTradePrice &&
        prev.bids.length === rawOrderBook.bids.length &&
        prev.asks.length === rawOrderBook.asks.length &&
        prev.bids.every((bid, i) => bid.price === rawOrderBook.bids[i]?.price && bid.size === rawOrderBook.bids[i]?.size) &&
        prev.asks.every((ask, i) => ask.price === rawOrderBook.asks[i]?.price && ask.size === rawOrderBook.asks[i]?.size)) {
      // Values haven't changed, return previous key
      return prevRawOrderBookRef.current;
    }

    // Values changed, update ref and return new key
    prevRawOrderBookRef.current = rawOrderBook;
    return rawOrderBook;
  }, [rawOrderBook]);

  // Process raw orderbook from shared hook with smoothing, throttling, and filtering
  useEffect(() => {
    if (!rawOrderBookKey) {
      return;
    }

    // Reset price history on new snapshot (when bids/asks change significantly)
    const bidsChanged = rawOrderBookKey.bids.length !== orderBookStateRef.current.bids.length;
    if (bidsChanged || rawOrderBookKey.asks.length !== orderBookStateRef.current.asks.length) {
      priceHistoryRef.current = {
        bestBid: [],
        bestAsk: [],
      };
    }

    // Apply filtering and aggregation to bids/asks
    let processedBids = filterSmallOrders(rawOrderBookKey.bids || []);
    processedBids = aggregatePriceLevels(processedBids, "BUY");
    
    let processedAsks = filterSmallOrders(rawOrderBookKey.asks || []);
    processedAsks = aggregatePriceLevels(processedAsks, "SELL");

    // Update orderbook with processed data (apply smoothing to prices)
    updateOrderBook({
      bids: processedBids,
      asks: processedAsks,
      bestBid: rawOrderBookKey.bestBid,
      bestAsk: rawOrderBookKey.bestAsk,
      lastTradePrice: rawOrderBookKey.lastTradePrice,
    });
  }, [rawOrderBookKey, updateOrderBook]);

  // Stub functions for backward compatibility (shared hook handles connection)
  const connect = useCallback(() => {
    // Connection is handled by shared hook, no-op here
  }, []);

  const disconnect = useCallback(() => {
    // Connection is handled by shared hook, no-op here
    // Flush any pending updates
    if (pendingUpdateRef.current) {
      flushPendingUpdate();
      flushPendingPriceUpdate();
    }
  }, [flushPendingUpdate, flushPendingPriceUpdate]);

  // Reset state when assetIds change
  useEffect(() => {
    // Reset orderbook state when switching
    orderBookStateRef.current = {
      bids: [],
      asks: [],
      bestBid: null,
      bestAsk: null,
      lastTradePrice: null,
      spread: null,
    };
    
    // Reset price history and smoothed prices
    priceHistoryRef.current = {
      bestBid: [],
      bestAsk: [],
    };
    smoothedPriceRef.current = {
      bestBid: null,
      bestAsk: null,
    };
    
    // Clear pending updates
    pendingUpdateRef.current = null;
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = null;
    }
    if (priceUpdateTimeoutRef.current) {
      clearTimeout(priceUpdateTimeoutRef.current);
      priceUpdateTimeoutRef.current = null;
    }
    lastUpdateTimeRef.current = 0;
    lastPriceUpdateTimeRef.current = 0;
    
    setOrderBook(orderBookStateRef.current);
  }, [assetIds?.join(',')]); // Only depend on assetIds string, not functions

  return {
    orderBook,
    isConnected: sharedIsConnected,
    connectionStatus,
    rawMessages,
    connect,
    disconnect,
    lastTrade: sharedLastTrade,
  };
}

