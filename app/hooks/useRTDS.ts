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

export function useRTDS() {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    setConnectionStatus("connecting");
    console.log("Connecting to RTDS...");

    try {
      const ws = new WebSocket("wss://ws-live-data.polymarket.com");
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("RTDS WebSocket connected");
        setIsConnected(true);
        setConnectionStatus("connected");
        reconnectAttempts.current = 0;

        // Subscribe to Chainlink BTC/USD prices
        const subscribeMessage = {
          action: "subscribe",
          subscriptions: [
            {
              topic: "crypto_prices_chainlink",
              type: "*",
              filters: '{"symbol":"btc/usd"}',
            },
          ],
        };

        console.log("Subscribing to crypto_prices_chainlink:", subscribeMessage);
        ws.send(JSON.stringify(subscribeMessage));
      };

      ws.onmessage = (event) => {
        try {
          // Check if message is empty or not a string
          if (!event.data || typeof event.data !== "string") {
            console.log("RTDS received non-string or empty message:", event.data);
            return;
          }

          // Trim whitespace and check if empty
          const trimmedData = event.data.trim();
          if (!trimmedData) {
            console.log("RTDS received empty message");
            return;
          }

          const data = JSON.parse(trimmedData);
          console.log("RTDS message received:", data);

          // Handle price updates
          if (
            data.topic === "crypto_prices_chainlink" &&
            data.type === "update" &&
            data.payload
          ) {
            const priceUpdate = data as PriceUpdate;
            if (priceUpdate.payload.symbol === "btc/usd") {
              setLastPrice(priceUpdate.payload.value);
              console.log("BTC/USD price update:", priceUpdate.payload.value);
            }
          }
        } catch (error) {
          // Only log if it's not an empty/invalid JSON error
          if (error instanceof SyntaxError) {
            console.warn("RTDS received invalid JSON:", event.data);
          } else {
            console.error("Error parsing RTDS message:", error, event.data);
          }
        }
      };

      ws.onerror = (error) => {
        console.error("RTDS WebSocket error:", error);
        setConnectionStatus("error");
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log("RTDS WebSocket closed");
        setIsConnected(false);
        setConnectionStatus("disconnected");

        // Attempt to reconnect with exponential backoff
        if (reconnectAttempts.current < 5) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          console.log("Max reconnection attempts reached");
          setConnectionStatus("error");
        }
      };
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
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

