"use client";

import { useEffect, useRef, useState } from "react";

export function useBinancePrice() {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const useWebSocketRef = useRef(true); // Try WebSocket first, fallback to REST if it fails
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fallback: Fetch price via REST API if WebSocket fails
  const fetchPriceViaREST = async () => {
    try {
      const response = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", {
        cache: "no-store",
      });
      if (response.ok) {
        const data = await response.json();
        const price = parseFloat(data.price);
        if (!isNaN(price) && price > 0) {
          setLastPrice(price);
          setIsConnected(true);
          setConnectionStatus("connected");
          console.log("Binance BTC/USDT price (REST):", price);
        }
      }
    } catch (error) {
      console.error("Binance REST API error:", error);
    }
  };

  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    // If WebSocket failed multiple times, use REST API polling instead
    if (!useWebSocketRef.current) {
      setConnectionStatus("connecting");
      fetchPriceViaREST();
      // Poll every 2 seconds via REST API
      pollingIntervalRef.current = setInterval(fetchPriceViaREST, 2000);
      return;
    }

    setConnectionStatus("connecting");
    console.log("Connecting to Binance WebSocket...");

    // Set a timeout - if connection doesn't open within 5 seconds, switch to REST API
    connectionTimeoutRef.current = setTimeout(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        console.log("Binance WebSocket connection timeout, switching to REST API");
        if (wsRef.current) {
          wsRef.current.close();
        }
        useWebSocketRef.current = false;
        connect(); // This will now use REST API
      }
    }, 5000);

    try {
      // Binance WebSocket for BTC/USDT ticker (24hr ticker stream)
      // Try without port first, as some environments may block port 9443
      const ws = new WebSocket("wss://stream.binance.com/ws/btcusdt@ticker");
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("Binance WebSocket connected");
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        setIsConnected(true);
        setConnectionStatus("connected");
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          if (!event.data || typeof event.data !== "string") {
            console.log("Binance received non-string or empty message:", event.data);
            return;
          }

          const trimmedData = event.data.trim();
          if (!trimmedData) {
            console.log("Binance received empty message");
            return;
          }

          const data = JSON.parse(trimmedData);
          console.log("Binance message received:", data);
          
          // Binance ticker format: { c: "currentPrice", ... }
          // c = last price (close price)
          if (data.c) {
            const price = parseFloat(data.c);
            if (!isNaN(price) && price > 0) {
              setLastPrice(price);
              console.log("Binance BTC/USDT price update:", price);
            } else {
              console.warn("Binance price is invalid:", data.c);
            }
          } else {
            console.log("Binance message doesn't contain price field 'c':", Object.keys(data));
          }
        } catch (error) {
          if (error instanceof SyntaxError) {
            console.warn("Binance received invalid JSON:", event.data);
          } else {
            console.error("Error parsing Binance message:", error, event.data);
          }
        }
      };

      ws.onerror = (error) => {
        // WebSocket error event doesn't always provide detailed error info
        console.error("Binance WebSocket error:", error);
        console.error("WebSocket readyState:", ws.readyState);
        setConnectionStatus("error");
        setIsConnected(false);
      };

      ws.onclose = (event) => {
        console.log("Binance WebSocket closed", event.code, event.reason);
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        setIsConnected(false);
        setConnectionStatus("disconnected");

        // If WebSocket fails after 2 attempts, switch to REST API polling immediately
        if (reconnectAttempts.current >= 2) {
          console.log("WebSocket failed multiple times, switching to REST API polling");
          useWebSocketRef.current = false;
          connect(); // This will now use REST API
          return;
        }

        // Attempt to reconnect with exponential backoff
        if (reconnectAttempts.current < 3) {
          const delay = Math.min(2000 * Math.pow(2, reconnectAttempts.current), 10000);
          reconnectAttempts.current++;
          console.log(`Reconnecting Binance in ${delay}ms (attempt ${reconnectAttempts.current})`);

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          console.log("Max reconnection attempts reached for Binance, switching to REST API");
          useWebSocketRef.current = false;
          connect(); // Switch to REST API
        }
      };
    } catch (error) {
      console.error("Failed to create Binance WebSocket:", error);
      setConnectionStatus("error");
      setIsConnected(false);
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
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
