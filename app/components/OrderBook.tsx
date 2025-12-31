"use client";

import { useState, useEffect } from "react";
import { useCLOBOrderBook } from "../hooks/useCLOBOrderBook";

interface MarketData {
  assetIds?: string[];
  conditionId?: string;
}

interface MarketDataWithTime extends MarketData {
  endTime?: string;
  startTime?: string;
}

export default function OrderBook() {
  const [activeTab, setActiveTab] = useState<"up" | "down">("up");
  const [marketData, setMarketData] = useState<MarketDataWithTime | null>(null);

  // Fetch market data to get asset IDs
  const fetchMarketData = async () => {
    try {
      const response = await fetch("/api/markets?query=btc&limit=5");
      const data = await response.json();
      if (data.success && data.market) {
        // Get asset IDs from market data (already extracted in API)
        const assetIds = data.market.assetIds || [];

        setMarketData({
          assetIds: assetIds.length > 0 ? assetIds : null,
          conditionId: data.market.condition?.id || data.market.raw?.conditionId || null,
          endTime: data.market.endTime,
          startTime: data.market.startTime,
        });
      }
    } catch (error) {
      console.error("Failed to fetch market data for orderbook:", error);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchMarketData();
  }, []);

  // Auto-refresh: Check if market has ended and fetch new market
  useEffect(() => {
    if (!marketData?.endTime) return;

    const interval = setInterval(() => {
      const end = new Date(marketData.endTime!);
      const now = new Date();
      
      // If market has ended, fetch next market
      if (end.getTime() <= now.getTime()) {
        fetchMarketData();
      }
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [marketData?.endTime]);

  // Backup: Check for new market every 2 minutes
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      if (marketData?.endTime) {
        const end = new Date(marketData.endTime);
        const now = new Date();
        // If market ended or will end soon, refresh
        if (end.getTime() <= now.getTime() + 60000) { // 1 minute before or after
          fetchMarketData();
        }
      }
    }, 120000); // Every 2 minutes

    return () => clearInterval(refreshInterval);
  }, [marketData?.endTime]);

  // Get asset ID based on active tab
  // For "up" tab, use first asset ID (Yes/Up token)
  // For "down" tab, use second asset ID (No/Down token)
  const selectedAssetId = marketData?.assetIds && marketData.assetIds.length >= 2
    ? (activeTab === "up" ? marketData.assetIds[0] : marketData.assetIds[1])
    : null;

  // Create a stable key that changes when tab or asset IDs change
  // This ensures the hook reconnects when switching tabs
  const assetIdsKey = selectedAssetId 
    ? `${activeTab}-${selectedAssetId}` 
    : null;

  // Get live orderbook data - pass array with selected asset ID
  // The hook will reconnect when assetIds change (including tab switches)
  const { orderBook, isConnected, connectionStatus } = useCLOBOrderBook(
    selectedAssetId ? [selectedAssetId] : null
  );

  // Format price for display (convert to cents)
  const formatPrice = (price: string | null): string => {
    if (!price) return "—";
    const priceNum = parseFloat(price);
    if (isNaN(priceNum)) return "—";
    const cents = (priceNum * 100).toFixed(0);
    return `${cents}¢`;
  };

  // Format shares
  const formatShares = (size: string): string => {
    const sizeNum = parseFloat(size);
    if (isNaN(sizeNum)) return "—";
    return sizeNum.toFixed(2);
  };

  // Calculate total (price * size)
  const calculateTotal = (price: string, size: string): string => {
    const priceNum = parseFloat(price);
    const sizeNum = parseFloat(size);
    if (isNaN(priceNum) || isNaN(sizeNum)) return "—";
    const total = priceNum * sizeNum;
    return `$${total.toFixed(2)}`;
  };

  // Get asks and bids from orderbook
  const asks = orderBook.asks || [];
  const bids = orderBook.bids || [];
  
  // Limit to top 10 levels for display
  const displayAsks = asks.slice(0, 10);
  const displayBids = bids.slice(0, 10);

  return (
    <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-3 sm:p-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-white sm:text-lg">Order Book</h3>
          <button className="text-zinc-400 hover:text-white">
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400">$32.3k Vol.</span>
          <svg
            className="h-4 w-4 text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 15l7-7 7 7"
            />
          </svg>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-2 border-b border-zinc-800">
        <button
          onClick={() => setActiveTab("up")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "up"
              ? "border-blue-500 text-white"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          Trade Up
        </button>
        <button
          onClick={() => setActiveTab("down")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "down"
              ? "border-blue-500 text-white"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          Trade Down
        </button>
      </div>

      <div className="flex flex-col gap-4 md:flex-row">
        {/* Asks (Red) */}
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-3 w-1 rounded bg-red-500"></div>
            <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-400">
              Asks
            </span>
          </div>
          <div className="mb-2 grid grid-cols-3 gap-2 text-xs font-semibold text-zinc-400">
            <div>PRICE</div>
            <div className="text-center">SHARES</div>
            <div className="text-right">TOTAL</div>
          </div>
          <div className="space-y-1">
            {displayAsks.length > 0 ? (
              displayAsks.map((ask, i) => (
                <div
                  key={`${ask.price}-${i}`}
                  className="grid grid-cols-3 gap-2 rounded bg-red-500/10 px-2 py-1 text-xs sm:text-sm"
                >
                  <span className="font-medium text-red-400">{formatPrice(ask.price)}</span>
                  <span className="text-center text-zinc-300">{formatShares(ask.size)}</span>
                  <span className="text-right text-zinc-300">{calculateTotal(ask.price, ask.size)}</span>
                </div>
              ))
            ) : (
              <div className="py-4 text-center text-xs text-zinc-500">
                {connectionStatus === "connecting" ? "Connecting..." : 
                 connectionStatus === "error" ? "Connection error" : 
                 "No asks available"}
              </div>
            )}
          </div>
          <div className="mt-2 text-center text-xs text-zinc-400 sm:text-sm">
            {orderBook.lastTradePrice ? (
              <>Last: {formatPrice(orderBook.lastTradePrice)}</>
            ) : (
              <>Last: —</>
            )}
            {isConnected && (
              <span className="ml-2 text-[10px] text-green-400">●</span>
            )}
          </div>
        </div>

        {/* Spread */}
        <div className="flex items-center justify-center text-xs text-zinc-500 md:flex-col">
          Spread: {orderBook.spread ? `${(parseFloat(orderBook.spread) * 100).toFixed(0)}¢` : "—"}
        </div>

        {/* Bids (Green) */}
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-3 w-1 rounded bg-green-500"></div>
            <span className="rounded bg-green-500/20 px-2 py-0.5 text-xs font-semibold text-green-400">
              Bids
            </span>
          </div>
          <div className="mb-2 grid grid-cols-3 gap-2 text-xs font-semibold text-zinc-400">
            <div>PRICE</div>
            <div className="text-center">SHARES</div>
            <div className="text-right">TOTAL</div>
          </div>
          <div className="space-y-1">
            {displayBids.length > 0 ? (
              displayBids.map((bid, i) => (
                <div
                  key={`${bid.price}-${i}`}
                  className="grid grid-cols-3 gap-2 rounded bg-green-500/10 px-2 py-1 text-xs sm:text-sm"
                >
                  <span className="font-medium text-green-400">{formatPrice(bid.price)}</span>
                  <span className="text-center text-zinc-300">{formatShares(bid.size)}</span>
                  <span className="text-right text-zinc-300">{calculateTotal(bid.price, bid.size)}</span>
                </div>
              ))
            ) : (
              <div className="py-4 text-center text-xs text-zinc-500">
                {connectionStatus === "connecting" ? "Connecting..." : 
                 connectionStatus === "error" ? "Connection error" : 
                 "No bids available"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
