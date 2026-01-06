"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface OrderLevel {
  price: string;
  size: string;
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
  const [orderBook, setOrderBook] = useState<OrderBookState>({
    bids: [],
    asks: [],
    bestBid: null,
    bestAsk: null,
    lastTradePrice: null,
    spread: null,
  });
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");
  const [rawMessages, setRawMessages] = useState<any[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const orderBookStateRef = useRef<OrderBookState>({
    bids: [],
    asks: [],
    bestBid: null,
    bestAsk: null,
    lastTradePrice: null,
    spread: null,
  });

  // Helper to calculate spread
  const calculateSpread = (bestBid: string | null, bestAsk: string | null): string | null => {
    if (!bestBid || !bestAsk) return null;
    const bid = parseFloat(bestBid);
    const ask = parseFloat(bestAsk);
    if (isNaN(bid) || isNaN(ask)) return null;
    const spreadValue = ask - bid;
    return spreadValue.toFixed(4);
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

  // Update orderbook state - use useCallback with empty deps to keep it stable
  const updateOrderBook = useCallback((updates: Partial<OrderBookState>) => {
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

    setOrderBook({ ...orderBookStateRef.current });
  }, []); // Empty deps - function never changes

  const connect = useCallback(() => {
    if (!assetIds || assetIds.length === 0) {
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    setConnectionStatus("connecting");
    
    // Store assetIds in a ref to avoid closure issues
    const currentAssetIds = assetIds;

    try {
      // CLOB WebSocket endpoint
      const ws = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setConnectionStatus("connected");
        reconnectAttempts.current = 0;

        // Subscribe to market channel with asset IDs
        const subscribeMessage = {
          assets_ids: currentAssetIds,
          type: "market",
        };

        ws.send(JSON.stringify(subscribeMessage));
      };

      ws.onmessage = (event) => {
        try {
          if (!event.data || typeof event.data !== "string") {
            return;
          }

          const trimmedData = event.data.trim();
          if (!trimmedData) {
            return;
          }

          const data = JSON.parse(trimmedData) as OrderBookMessage;

          // Store raw message for debugging (keep last 50 messages)
          setRawMessages((prev) => {
            const newMessages = [...prev, { ...data, receivedAt: new Date().toISOString() }];
            return newMessages.slice(-50); // Keep last 50 messages
          });

          // Handle book message (initial snapshot)
          if (data.event_type === "book") {
            const bookMsg = data as BookMessage;
            
            // Update best bid/ask from book first
            let bestBid = null;
            let bestAsk = null;
            if (bookMsg.bids && bookMsg.bids.length > 0) {
              bestBid = bookMsg.bids[0].price;
            }
            if (bookMsg.asks && bookMsg.asks.length > 0) {
              bestAsk = bookMsg.asks[0].price;
            }
            
            // Update all at once to avoid multiple state updates
            updateOrderBook({
              bids: bookMsg.bids || [],
              asks: bookMsg.asks || [],
              bestBid,
              bestAsk,
            });
          }

          // Handle price_change message (incremental updates)
          if (data.event_type === "price_change") {
            const priceChangeMsg = data as PriceChangeMessage;
            
            let updatedBids = orderBookStateRef.current.bids;
            let updatedAsks = orderBookStateRef.current.asks;
            let bestBid = orderBookStateRef.current.bestBid;
            let bestAsk = orderBookStateRef.current.bestAsk;
            
            priceChangeMsg.price_changes.forEach((change) => {
              if (change.side === "BUY") {
                updatedBids = updatePriceLevel(
                  updatedBids,
                  change.price,
                  change.size,
                  "BUY"
                );
              } else {
                updatedAsks = updatePriceLevel(
                  updatedAsks,
                  change.price,
                  change.size,
                  "SELL"
                );
              }

              // Update best bid/ask
              if (change.best_bid) {
                bestBid = change.best_bid;
              }
              if (change.best_ask) {
                bestAsk = change.best_ask;
              }
            });
            
            // Update all at once
            updateOrderBook({
              bids: updatedBids,
              asks: updatedAsks,
              bestBid,
              bestAsk,
            });
          }

          // Handle best_bid_ask message
          if (data.event_type === "best_bid_ask") {
            const bestBidAskMsg = data as BestBidAskMessage;
            updateOrderBook({
              bestBid: bestBidAskMsg.best_bid,
              bestAsk: bestBidAskMsg.best_ask,
            });
          }

          // Handle last_trade_price message
          if (data.event_type === "last_trade_price") {
            const lastTradeMsg = data as LastTradePriceMessage;
            updateOrderBook({
              lastTradePrice: lastTradeMsg.price,
            });
          }
        } catch (error) {
          // Silently handle errors
        }
      };

      ws.onerror = () => {
        setConnectionStatus("error");
        setIsConnected(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        setConnectionStatus("disconnected");

        // Attempt to reconnect with exponential backoff
        if (reconnectAttempts.current < 5) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          setConnectionStatus("error");
        }
      };
    } catch (error) {
      setConnectionStatus("error");
      setIsConnected(false);
    }
  }, [assetIds, updateOrderBook]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setConnectionStatus("disconnected");
    reconnectAttempts.current = 0;
  }, []);

  useEffect(() => {
    if (!assetIds || assetIds.length === 0) {
      // Disconnect if no asset IDs
      disconnect();
      return;
    }

    // Disconnect any existing connection before connecting with new asset IDs
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setIsConnected(false);
      setConnectionStatus("disconnected");
    }

    // Reset orderbook state when switching
    orderBookStateRef.current = {
      bids: [],
      asks: [],
      bestBid: null,
      bestAsk: null,
      lastTradePrice: null,
      spread: null,
    };
    setOrderBook(orderBookStateRef.current);

    // Connect with new asset IDs
    connect();

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetIds?.join(',')]); // Only depend on assetIds string, not functions

  return {
    orderBook,
    isConnected,
    connectionStatus,
    rawMessages,
    connect,
    disconnect,
  };
}

