"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRTDS } from "./useRTDS";
import { useCLOBOrderBook } from "./useCLOBOrderBook";

interface MarketInfo {
  symbol: string; // "BTC", "ETH", "SOL", "XRP"
  marketId: string;
  slug: string;
  title: string;
  assetIds: string[]; // [yesAssetId, noAssetId]
  startTimeMs: number;
  endTimeMs: number;
  referencePrice: number | null;
  isActive: boolean;
  isExpired: boolean;
  lastSeen: number; // timestamp when last seen in WebSocket
}

interface DiscoveredMarket {
  symbol: string;
  yesAssetId: string;
  noAssetId: string;
  market: string; // market identifier from WebSocket
  timestamp: number;
}

/**
 * WebSocket-based market discovery hook
 * Discovers BTC, ETH, SOL, XRP 15-minute markets from CLOB WebSocket messages
 * Gets reference prices from RTDS WebSocket
 */
export function useMultiMarketDiscovery() {
  const [markets, setMarkets] = useState<Map<string, MarketInfo>>(new Map());
  const [isDiscovering, setIsDiscovering] = useState(false);
  
  // Track discovered markets from WebSocket messages
  const discoveredMarketsRef = useRef<Map<string, DiscoveredMarket>>(new Map());
  const marketPatternsRef = useRef<Map<string, RegExp>>(new Map([
    ["BTC", /btc.*up.*down|bitcoin.*up.*down/i],
    ["ETH", /eth.*up.*down|ethereum.*up.*down/i],
    ["SOL", /sol.*up.*down|solana.*up.*down/i],
    ["XRP", /xrp.*up.*down|ripple.*up.*down/i],
  ]));
  
  // Track crypto prices from RTDS
  const cryptoPricesRef = useRef<Map<string, number>>(new Map());
  
  // Subscribe to all crypto prices via RTDS
  const btcPrice = useRTDS("chainlink");
  // Note: We'd need separate RTDS hooks for ETH, SOL, XRP, but for now we'll use the market data
  
  // Track crypto prices
  useEffect(() => {
    if (btcPrice.lastPrice) {
      cryptoPricesRef.current.set("BTC", btcPrice.lastPrice);
    }
  }, [btcPrice.lastPrice]);
  
  // Process market messages to discover markets (defined before connectCLOB uses it)
  const processMarketMessage = useCallback((message: any) => {
    const market = message.market;
    const assetId = message.asset_id;
    
    if (!market || !assetId) return;
    
    // Check if this looks like a 15-minute market
    // Pattern: {symbol}-updown-15m-{timestamp} or similar
    const is15MinMarket = /15m|15.*min/i.test(market);
    if (!is15MinMarket) return;
    
    // Try to identify symbol from market name
    let symbol: string | null = null;
    for (const [sym, pattern] of marketPatternsRef.current.entries()) {
      if (pattern.test(market)) {
        symbol = sym;
        break;
      }
    }
    
    if (!symbol) return;
    
    // Extract timestamp from market slug if possible
    const timestampMatch = market.match(/(\d{10})/); // Unix timestamp (10 digits)
    const marketTimestamp = timestampMatch ? parseInt(timestampMatch[1]) * 1000 : Date.now();
    
    // Calculate 15-minute window
    const startTimeMs = marketTimestamp;
    const endTimeMs = startTimeMs + 15 * 60 * 1000; // 15 minutes
    
    // Check if market is still active
    const now = Date.now();
    const isActive = endTimeMs > now;
    const isExpired = endTimeMs <= now;
    
    // Get or create discovered market
    const marketKey = `${symbol}-${marketTimestamp}`;
    let discovered = discoveredMarketsRef.current.get(marketKey);
    
    if (!discovered) {
      discovered = {
        symbol,
        yesAssetId: assetId, // We'll need to find the NO asset ID separately
        noAssetId: "", // Will be filled when we see the NO asset
        market,
        timestamp: marketTimestamp,
      };
      discoveredMarketsRef.current.set(marketKey, discovered);
    } else {
      // Update asset IDs - determine if this is YES or NO
      // YES assets typically have "yes" or "up" in the asset ID or market
      // NO assets typically have "no" or "down" in the asset ID or market
      const isYes = /yes|up/i.test(assetId) || /yes|up/i.test(market);
      const isNo = /no|down/i.test(assetId) || /no|down/i.test(market);
      
      if (isYes && !discovered.yesAssetId) {
        discovered.yesAssetId = assetId;
      } else if (isNo && !discovered.noAssetId) {
        discovered.noAssetId = assetId;
      }
    }
    
    // Get reference price from crypto prices
    const referencePrice = cryptoPricesRef.current.get(symbol) || null;
    
    // Update markets state
    setMarkets((prev) => {
      const newMarkets = new Map(prev);
      
      const marketInfo: MarketInfo = {
        symbol,
        marketId: marketKey,
        slug: market,
        title: `${symbol} Up or Down - ${new Date(startTimeMs).toLocaleTimeString()}`,
        assetIds: [discovered.yesAssetId, discovered.noAssetId].filter(Boolean),
        startTimeMs,
        endTimeMs,
        referencePrice,
        isActive,
        isExpired,
        lastSeen: now,
      };
      
      newMarkets.set(symbol, marketInfo);
      return newMarkets;
    });
  }, []);
  
  // Initial API call to get asset IDs, then use WebSocket for updates
  const [initialMarketsLoaded, setInitialMarketsLoaded] = useState(false);
  const subscribedAssetIdsRef = useRef<Set<string>>(new Set());
  
  // Custom CLOB WebSocket connection for market updates
  const [clobConnected, setClobConnected] = useState(false);
  const clobWsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  
  // Initial market discovery via API (one-time, then WebSocket takes over)
  useEffect(() => {
    if (initialMarketsLoaded) return;
    
    const fetchInitialMarkets = async () => {
      try {
        // One-time API call to get current active markets
        const response = await fetch("/api/markets/multi");
        const data = await response.json();
        
        if (data.success && data.markets) {
          data.markets.forEach((market: any) => {
            if (market.assetIds && market.assetIds.length >= 2) {
              // Subscribe to these asset IDs via WebSocket
              market.assetIds.forEach((assetId: string) => {
                subscribedAssetIdsRef.current.add(assetId);
              });
              
              // Process as discovered market
              const symbol = market.symbol;
              const timestamp = market.startTimeMs / 1000; // Convert to seconds
              const marketKey = `${symbol}-${Math.floor(timestamp / 900) * 900}`; // Round to 15-min interval
              
              const marketInfo: MarketInfo = {
                symbol,
                marketId: market.id || marketKey,
                slug: market.slug || `${symbol.toLowerCase()}-updown-15m-${Math.floor(timestamp / 900) * 900}`,
                title: market.title || `${symbol} Up or Down`,
                assetIds: market.assetIds || [],
                startTimeMs: market.startTimeMs,
                endTimeMs: market.endTimeMs,
                referencePrice: market.referencePrice,
                isActive: market.isActive,
                isExpired: market.isExpired,
                lastSeen: Date.now(),
              };
              
              setMarkets((prev) => {
                const newMarkets = new Map(prev);
                newMarkets.set(symbol, marketInfo);
                return newMarkets;
              });
            }
          });
          
          setInitialMarketsLoaded(true);
          setIsDiscovering(true);
        }
      } catch (error) {
        console.error("[MarketDiscovery] Failed to fetch initial markets:", error);
      }
    };
    
    fetchInitialMarkets();
  }, [initialMarketsLoaded]);
  
  // Connect to CLOB WebSocket for market updates
  const connectCLOB = useCallback(() => {
    if (clobWsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }
    
    // Wait for initial markets to load
    if (!initialMarketsLoaded || subscribedAssetIdsRef.current.size === 0) {
      return;
    }
    
    try {
      // Use the same CLOB WebSocket URL as the main app
      const ws = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");
      clobWsRef.current = ws;
      
      ws.onopen = () => {
        console.log("[MarketDiscovery] CLOB WebSocket connected");
        setClobConnected(true);
        reconnectAttempts.current = 0;
        
        // Subscribe to all discovered asset IDs
        const assetIds = Array.from(subscribedAssetIdsRef.current);
        const subscribeMessage = {
          assets_ids: assetIds,
          type: "market",
        };
        
        ws.send(JSON.stringify(subscribeMessage));
        console.log(`[MarketDiscovery] Subscribed to ${assetIds.length} asset IDs`);
      };
      
      ws.onmessage = (event) => {
        try {
          if (!event.data || typeof event.data !== "string") return;
          
          const trimmed = event.data.trim();
          if (!trimmed) return;
          
          const data = JSON.parse(trimmed);
          
          // Handle different message types - update market info
          if (data.event_type === "book" || data.event_type === "price_change" || 
              data.event_type === "best_bid_ask" || data.event_type === "last_trade_price") {
            processMarketMessage(data);
          }
        } catch (error) {
          // Silently handle parse errors
        }
      };
      
      ws.onerror = (error) => {
        console.error("[MarketDiscovery] CLOB WebSocket error:", error);
        setClobConnected(false);
      };
      
      ws.onclose = () => {
        console.log("[MarketDiscovery] CLOB WebSocket closed");
        setClobConnected(false);
        
        // Reconnect with exponential backoff
        if (reconnectAttempts.current < 5) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectCLOB();
          }, delay);
        }
      };
    } catch (error) {
      console.error("[MarketDiscovery] Failed to create CLOB WebSocket:", error);
      setClobConnected(false);
    }
  }, [initialMarketsLoaded, processMarketMessage]);
  
  // Clean up old markets (older than 1 hour)
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now();
      setMarkets((prev) => {
        const newMarkets = new Map(prev);
        for (const [symbol, market] of prev.entries()) {
          // Remove markets that haven't been seen in 1 hour
          if (now - market.lastSeen > 3600000) {
            newMarkets.delete(symbol);
          }
        }
        return newMarkets;
      });
    }, 60000); // Check every minute
    
    return () => clearInterval(cleanup);
  }, []);
  
  // Connect WebSocket after initial markets are loaded
  useEffect(() => {
    if (initialMarketsLoaded) {
      connectCLOB();
    }
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (clobWsRef.current) {
        clobWsRef.current.close();
      }
    };
  }, [initialMarketsLoaded, connectCLOB]);
  
  // Memoize markets array to prevent unnecessary re-renders
  const marketsArray = useMemo(() => Array.from(markets.values()), [markets]);
  
  return {
    markets: marketsArray,
    isDiscovering,
    isConnected: clobConnected,
  };
}
