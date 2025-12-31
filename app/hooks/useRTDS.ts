"use client";

import { useEffect, useRef, useState } from "react";

interface PriceUpdate {
  topic: string;
  type: string;
  timestamp: number;
  payload: {
    symbol: string;
    timestamp: number;
    value: number;
  };
}

export type PriceSource = "chainlink" | "binance";

export function useRTDS(source: PriceSource = "chainlink") {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const currentSourceRef = useRef<PriceSource>(source);

  // Function to subscribe to a specific source
  const subscribeToSource = (priceSource: PriceSource) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    let subscribeMessage;
    
    if (priceSource === "chainlink") {
      subscribeMessage = {
        action: "subscribe",
        subscriptions: [
          {
            topic: "crypto_prices_chainlink",
            type: "*",
            filters: '{"symbol":"btc/usd"}',
          },
        ],
      };
    } else {
      // Binance
      subscribeMessage = {
        action: "subscribe",
        subscriptions: [
          {
            topic: "crypto_prices",
            type: "update",
            filters: "btcusdt",
          },
        ],
      };
    }

    wsRef.current.send(JSON.stringify(subscribeMessage));
    currentSourceRef.current = priceSource;
  };

  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    setConnectionStatus("connecting");

    try {
      const ws = new WebSocket("wss://ws-live-data.polymarket.com");
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setConnectionStatus("connected");
        reconnectAttempts.current = 0;

        // Subscribe to selected source
        subscribeToSource(source);
      };

      ws.onmessage = (event) => {
        try {
          // Check if message is empty or not a string
          if (!event.data || typeof event.data !== "string") {
            return;
          }

          // Trim whitespace and check if empty
          const trimmedData = event.data.trim();
          if (!trimmedData) {
            return;
          }

          const data = JSON.parse(trimmedData);

          // Handle Chainlink price updates
          if (
            data.topic === "crypto_prices_chainlink" &&
            data.type === "update" &&
            data.payload
          ) {
            const priceUpdate = data as PriceUpdate;
            if (priceUpdate.payload.symbol === "btc/usd") {
              setLastPrice(priceUpdate.payload.value);
            }
          }
          
          // Handle Binance price updates
          if (
            data.topic === "crypto_prices" &&
            data.type === "update" &&
            data.payload
          ) {
            const priceUpdate = data as PriceUpdate;
            if (priceUpdate.payload.symbol === "btcusdt") {
              setLastPrice(priceUpdate.payload.value);
            }
          }
        } catch (error) {
          // Silently handle errors
        }
      };

      ws.onerror = (error) => {
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
  };

  const disconnect = () => {
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
  };

  // Subscribe when source changes (if already connected)
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && currentSourceRef.current !== source) {
      // Source changed, send new subscription
      subscribeToSource(source);
      // Clear price when switching (will update when new data arrives)
      setLastPrice(null);
    }
  }, [source]);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, []);

  return {
    isConnected,
    connectionStatus,
    lastPrice,
    connect,
    disconnect,
  };
}

