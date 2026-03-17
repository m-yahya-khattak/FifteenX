"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { isMainAppPaused } from "../lib/appConfig";

interface OrderBookMessage {
  event_type?: string;
  asset_id?: string;
  best_bid?: string | number;
  best_ask?: string | number;
  bids?: Array<{ price: string; size: string }>;
  asks?: Array<{ price: string; size: string }>;
  last_trade_price?: string | number;
  timestamp?: number;
  [key: string]: any;
}

type MessageCallback = (message: OrderBookMessage) => void;

/**
 * Shared WebSocket connection for CLOB orderbook data
 * Subscribes to ALL asset IDs and broadcasts messages to subscribers
 * This avoids creating multiple WebSocket connections
 */
class SharedCLOBWebSocket {
  private ws: WebSocket | null = null;
  private subscribers: Map<string, Set<MessageCallback>> = new Map(); // assetId -> callbacks
  private subscribedAssetIds: Set<string> = new Set();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private isConnecting = false;

  /**
   * Subscribe to messages for specific asset IDs
   */
  subscribe(assetIds: string[], callback: MessageCallback): () => void {
    // Add callback for each asset ID
    assetIds.forEach(assetId => {
      if (!this.subscribers.has(assetId)) {
        this.subscribers.set(assetId, new Set());
      }
      this.subscribers.get(assetId)!.add(callback);
    });

    // Update subscribed asset IDs and reconnect if needed
    const hadNewAssets = assetIds.some(id => !this.subscribedAssetIds.has(id));
    if (hadNewAssets) {
      assetIds.forEach(id => this.subscribedAssetIds.add(id));
      this.ensureConnected();
    }

    // Return unsubscribe function
    return () => {
      assetIds.forEach(assetId => {
        const callbacks = this.subscribers.get(assetId);
        if (callbacks) {
          callbacks.delete(callback);
          if (callbacks.size === 0) {
            this.subscribers.delete(assetId);
            this.subscribedAssetIds.delete(assetId);
          }
        }
      });
    };
  }

  /**
   * Ensure WebSocket is connected
   */
  private ensureConnected() {
    if (isMainAppPaused()) {
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      // Already connected, but may need to update subscription
      this.updateSubscription();
      return;
    }

    if (this.isConnecting) {
      return;
    }

    if (this.subscribedAssetIds.size === 0) {
      return; // No assets to subscribe to
    }

    this.isConnecting = true;
    this.connect();
  }

  /**
   * Connect to WebSocket
   */
  private connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.isConnecting = false;
      return;
    }

    try {
      const ws = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");
      this.ws = ws;

      ws.onopen = () => {
        console.log("[SharedCLOB] WebSocket connected");
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.updateSubscription();
      };

      ws.onmessage = (event) => {
        try {
          if (!event.data || typeof event.data !== "string") {
            return;
          }

          const trimmed = event.data.trim();
          if (!trimmed) {
            return;
          }

          // Check if message looks like JSON (starts with { or [)
          if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
            // Not JSON - might be an error message like "INVALID OPERATION"
            console.warn("[SharedCLOB] Received non-JSON message:", trimmed);
            return;
          }

          let data: OrderBookMessage;
          try {
            data = JSON.parse(trimmed) as OrderBookMessage;
          } catch (parseError) {
            console.error("[SharedCLOB] Failed to parse JSON message:", trimmed.substring(0, 100), parseError);
            return;
          }
          let assetId = data.asset_id;

          // Handle price_change messages - asset_id is inside price_changes array
          if (!assetId && data.event_type === "price_change" && (data as any).price_changes) {
            // For price_change, broadcast to all assets in price_changes
            const priceChanges = (data as any).price_changes;
            priceChanges.forEach((change: any) => {
              if (change.asset_id) {
                const callbacks = this.subscribers.get(change.asset_id);
                if (callbacks) {
                  callbacks.forEach(callback => {
                    try {
                      callback(data); // Broadcast the full message
                    } catch (error) {
                      console.error("[SharedCLOB] Error in subscriber callback:", error);
                    }
                  });
                }
              }
            });
            return; // Already handled, don't continue with normal flow
          }

          if (assetId) {
            // Broadcast to all subscribers for this asset
            const callbacks = this.subscribers.get(assetId);
            if (callbacks) {
              callbacks.forEach(callback => {
                try {
                  callback(data);
                } catch (error) {
                  console.error("[SharedCLOB] Error in subscriber callback:", error);
                }
              });
            }
          }
        } catch (error) {
          console.error("[SharedCLOB] Error parsing message:", error);
        }
      };

      ws.onerror = (error) => {
        console.error("[SharedCLOB] WebSocket error:", error);
        this.isConnecting = false;
      };

      ws.onclose = () => {
        console.log("[SharedCLOB] WebSocket closed");
        this.isConnecting = false;
        this.ws = null;

        // Reconnect with exponential backoff
        if (this.subscribedAssetIds.size > 0 && this.reconnectAttempts < 5) {
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
          this.reconnectAttempts++;
          this.reconnectTimeout = setTimeout(() => {
            this.connect();
          }, delay);
        }
      };
    } catch (error) {
      console.error("[SharedCLOB] Failed to create WebSocket:", error);
      this.isConnecting = false;
    }
  }

  /**
   * Update subscription with current asset IDs
   */
  private updateSubscription() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    if (this.subscribedAssetIds.size === 0) {
      return;
    }

    const subscribeMessage = {
      assets_ids: Array.from(this.subscribedAssetIds),
      type: "market",
    };

    this.ws.send(JSON.stringify(subscribeMessage));
  }

  /**
   * Get connection status
   */
  getStatus(): "disconnected" | "connecting" | "connected" {
    if (!this.ws) return "disconnected";
    if (this.ws.readyState === WebSocket.CONNECTING || this.isConnecting) return "connecting";
    if (this.ws.readyState === WebSocket.OPEN) return "connected";
    return "disconnected";
  }

  /**
   * Disconnect (for cleanup)
   */
  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscribers.clear();
    this.subscribedAssetIds.clear();
  }
}

// Singleton instance
const sharedWebSocket = new SharedCLOBWebSocket();

/**
 * Hook to use shared CLOB WebSocket connection
 * Subscribes to messages for specific asset IDs
 * Returns orderbook for the first asset ID (or aggregated if multiple)
 */
export function useSharedCLOBWebSocket(assetIds: string[] | null, filterAssetId?: string | null) {
  // Track orderbooks per asset ID
  const orderBooksRef = useRef<Map<string, {
    bids: Array<{ price: string; size: string }>;
    asks: Array<{ price: string; size: string }>;
    bestBid: string | null;
    bestAsk: string | null;
    lastTradePrice: string | null;
    spread: string | null;
  }>>(new Map());

  // Use ref to track previous orderbook values for comparison
  const prevOrderBookRef = useRef<{
    bids: Array<{ price: string; size: string }>;
    asks: Array<{ price: string; size: string }>;
    bestBid: string | null;
    bestAsk: string | null;
    lastTradePrice: string | null;
    spread: string | null;
  } | null>(null);

  const [orderBookState, setOrderBookState] = useState<{
    bids: Array<{ price: string; size: string }>;
    asks: Array<{ price: string; size: string }>;
    bestBid: string | null;
    bestAsk: string | null;
    lastTradePrice: string | null;
    spread: string | null;
  }>({
    bids: [],
    asks: [],
    bestBid: null,
    bestAsk: null,
    lastTradePrice: null,
    spread: null,
  });

  // Pending updates for batching (non-critical fields)
  const pendingUpdateRef = useRef<Partial<{
    bids: Array<{ price: string; size: string }>;
    asks: Array<{ price: string; size: string }>;
    lastTradePrice: string | null;
    spread: string | null;
  }> | null>(null);
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const BATCH_DELAY_MS = 30; // 30ms micro-batching delay

  // Memoize orderbook to only create new reference when values actually change
  const orderBook = useMemo(() => {
    const current = orderBookState;
    const prev = prevOrderBookRef.current;

    // Deep comparison to avoid creating new object if values haven't changed
    if (prev &&
        prev.bestBid === current.bestBid &&
        prev.bestAsk === current.bestAsk &&
        prev.lastTradePrice === current.lastTradePrice &&
        prev.spread === current.spread &&
        prev.bids.length === current.bids.length &&
        prev.asks.length === current.asks.length &&
        prev.bids.every((bid, i) => bid.price === current.bids[i]?.price && bid.size === current.bids[i]?.size) &&
        prev.asks.every((ask, i) => ask.price === current.asks[i]?.price && ask.size === current.asks[i]?.size)) {
      // Values haven't changed, return previous object reference
      return prev;
    }

    // Values changed, update ref and return new object
    prevOrderBookRef.current = { ...current };
    return { ...current };
  }, [orderBookState]);

  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");

  // Track last trade for fill detection
  const [lastTrade, setLastTrade] = useState<{
    price: number;
    size: number;
    side: "BUY" | "SELL";
    timestamp: number;
    assetId: string;
  } | null>(null);

  // Flush pending batched updates
  const flushPendingUpdate = useCallback(() => {
    if (pendingUpdateRef.current) {
      setOrderBookState((prev) => ({
        ...prev,
        ...pendingUpdateRef.current,
      }));
      pendingUpdateRef.current = null;
    }
    batchTimeoutRef.current = null;
  }, []);

  // Schedule batched update for non-critical fields
  const scheduleBatchedUpdate = useCallback((updates: typeof pendingUpdateRef.current) => {
    if (!updates) return;
    
    // Merge with existing pending updates
    pendingUpdateRef.current = {
      ...pendingUpdateRef.current,
      ...updates,
    };

    // Schedule flush if not already scheduled
    if (!batchTimeoutRef.current) {
      batchTimeoutRef.current = setTimeout(flushPendingUpdate, BATCH_DELAY_MS);
    }
  }, [flushPendingUpdate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
      }
    };
  }, []);

  // Use ref to track filterAssetId so callback always has latest value without causing re-subscriptions
  const filterAssetIdRef = useRef(filterAssetId);

  // Update ref when filterAssetId changes
  useEffect(() => {
    filterAssetIdRef.current = filterAssetId;
  }, [filterAssetId]);

  // Update connection status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const status = sharedWebSocket.getStatus();
      setConnectionStatus(status);
      setIsConnected(status === "connected");
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Subscribe to asset IDs (only re-subscribe when assetIds change, not when filterAssetId changes)
  useEffect(() => {
    if (!assetIds || assetIds.length === 0) {
      return;
    }

    const callback: MessageCallback = (message) => {
      // Handle price_change messages - asset_id is inside price_changes array
      if (message.event_type === "price_change" && (message as any).price_changes) {
        const priceChanges = (message as any).price_changes;
        const targetAssetId = filterAssetIdRef.current || assetIds[0];
        let shouldUpdateTarget = false;
        
        // Process all price changes first, then update state once
        priceChanges.forEach((change: any) => {
          const assetId = change.asset_id;
          if (!assetId) return;

          // Get or create orderbook for this asset
          let assetOrderBook = orderBooksRef.current.get(assetId);
          if (!assetOrderBook) {
            assetOrderBook = {
              bids: [],
              asks: [],
              bestBid: null,
              bestAsk: null,
              lastTradePrice: null,
              spread: null,
            };
            orderBooksRef.current.set(assetId, assetOrderBook);
          }

          // Update best bid/ask from price_change
          if (change.best_bid) {
            assetOrderBook.bestBid = change.best_bid.toString();
          }
          if (change.best_ask) {
            assetOrderBook.bestAsk = change.best_ask.toString();
          }
          if (assetOrderBook.bestBid && assetOrderBook.bestAsk) {
            assetOrderBook.spread = (parseFloat(assetOrderBook.bestAsk) - parseFloat(assetOrderBook.bestBid)).toFixed(4);
          }

          // Track if we need to update the target asset
          if (assetId === targetAssetId) {
            shouldUpdateTarget = true;
          }
        });
        
        // Update state once after processing all changes
        if (shouldUpdateTarget) {
          const targetOrderBook = orderBooksRef.current.get(targetAssetId);
          if (targetOrderBook) {
            // CRITICAL: Update bestBid/bestAsk immediately (used for fill detection)
            setOrderBookState((prev) => ({
              ...prev,
              bestBid: targetOrderBook.bestBid,
              bestAsk: targetOrderBook.bestAsk,
              spread: targetOrderBook.spread,
            }));
            
            // NON-CRITICAL: Batch bids/asks arrays (less critical, can tolerate small delay)
            scheduleBatchedUpdate({
              bids: targetOrderBook.bids,
              asks: targetOrderBook.asks,
            });
          }
        }
        return; // Already handled
      }

      // Handle messages with top-level asset_id
      const assetId = message.asset_id;
      if (!assetId) return;

      // Get or create orderbook for this asset
      let assetOrderBook = orderBooksRef.current.get(assetId);
      if (!assetOrderBook) {
        assetOrderBook = {
          bids: [],
          asks: [],
          bestBid: null,
          bestAsk: null,
          lastTradePrice: null,
          spread: null,
        };
        orderBooksRef.current.set(assetId, assetOrderBook);
      }

      // Update orderbook based on message type
      if (message.event_type === "book" || message.event_type === "best_bid_ask") {
        // Only update bestBid/bestAsk if they're present in the message (preserve existing values if not)
        if (message.best_bid !== undefined && message.best_bid !== null) {
          assetOrderBook.bestBid = message.best_bid.toString();
        }
        if (message.best_ask !== undefined && message.best_ask !== null) {
          assetOrderBook.bestAsk = message.best_ask.toString();
        }
        if (message.bids) assetOrderBook.bids = message.bids;
        if (message.asks) assetOrderBook.asks = message.asks;
        if (assetOrderBook.bestBid && assetOrderBook.bestAsk) {
          assetOrderBook.spread = (parseFloat(assetOrderBook.bestAsk) - parseFloat(assetOrderBook.bestBid)).toFixed(4);
        }
      } else if (message.event_type === "last_trade_price") {
        // Only update lastTradePrice, preserve existing bestBid/bestAsk
        assetOrderBook.lastTradePrice = message.last_trade_price?.toString() || null;
        
        // Track last trade for fill detection (if this is the target asset)
        const targetAssetId = filterAssetIdRef.current || assetIds[0];
        if (assetId === targetAssetId) {
          const tradePrice = parseFloat(message.last_trade_price?.toString() || "0");
          const tradeSize = parseFloat((message as any).size?.toString() || "0");
          const tradeSide = (message as any).side as "BUY" | "SELL";
          const tradeTimestamp = (message as any).timestamp 
            ? (typeof (message as any).timestamp === "string" ? parseInt((message as any).timestamp) : (message as any).timestamp)
            : Date.now();
          
          if (tradePrice > 0 && tradeSize > 0 && tradeSide) {
            setLastTrade({
              price: tradePrice,
              size: tradeSize,
              side: tradeSide,
              timestamp: tradeTimestamp,
              assetId: assetId,
            });
          }
        }
      }

      // Update state with filtered asset's orderbook (use ref to get latest filterAssetId)
      const targetAssetId = filterAssetIdRef.current || assetIds[0];
      if (assetId === targetAssetId) {
        // For last_trade_price messages, merge with existing state to preserve bestBid/bestAsk
        if (message.event_type === "last_trade_price") {
          // NON-CRITICAL: Batch lastTradePrice updates
          scheduleBatchedUpdate({
            lastTradePrice: assetOrderBook.lastTradePrice,
          });
        } else {
          // For book/best_bid_ask messages, always update (they may or may not have bestBid/bestAsk)
          // For other messages, only update if we have bestBid/bestAsk
          if (message.event_type === "book" || message.event_type === "best_bid_ask" || (assetOrderBook.bestBid && assetOrderBook.bestAsk)) {
            // CRITICAL: Update bestBid/bestAsk immediately
            setOrderBookState((prev) => ({
              ...prev,
              bestBid: assetOrderBook.bestBid,
              bestAsk: assetOrderBook.bestAsk,
              spread: assetOrderBook.spread,
            }));
            
            // NON-CRITICAL: Batch bids/asks arrays
            scheduleBatchedUpdate({
              bids: assetOrderBook.bids,
              asks: assetOrderBook.asks,
            });
          }
        }
      }
    };

    const unsubscribe = sharedWebSocket.subscribe(assetIds, callback);

    return unsubscribe;
  }, [assetIds]); // Only re-subscribe when assetIds change, not when filterAssetId changes

  return {
    orderBook,
    isConnected,
    connectionStatus,
    lastTrade,
  };
}
