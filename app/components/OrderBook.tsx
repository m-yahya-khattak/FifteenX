"use client";

import { useState, useEffect, useMemo } from "react";
import { useCLOBOrderBook } from "../hooks/useCLOBOrderBook";
import { useVirtualTrading } from "../hooks/useVirtualTrading";

interface MarketData {
  assetIds?: string[];
  conditionId?: string;
  marketId?: string;
  marketTitle?: string;
}

interface MarketDataWithTime extends MarketData {
  endTime?: string;
  startTime?: string;
}

export default function OrderBook() {
  const [activeTab, setActiveTab] = useState<"up" | "down">("up");
  const [marketData, setMarketData] = useState<MarketDataWithTime | null>(null);
  const [quantity, setQuantity] = useState<string>("1");
  const [tradeMessage, setTradeMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [upOrderBook, setUpOrderBook] = useState<any>(null);
  const [downOrderBook, setDownOrderBook] = useState<any>(null);
  
  // Virtual trading hook
  const { buy, sell, positions, balance } = useVirtualTrading();

  // Fetch market data to get asset IDs
  const fetchMarketData = async () => {
    try {
      const response = await fetch("/api/markets?query=btc&limit=5");
      const data = await response.json();
      if (data.success && data.market) {
        const assetIds = data.market.assetIds || [];

        setMarketData({
          assetIds: assetIds.length > 0 ? assetIds : null,
          conditionId: data.market.condition?.id || data.market.raw?.conditionId || null,
          endTime: data.market.endTime,
          startTime: data.market.startTime,
          marketId: data.market.id || data.market.slug,
          marketTitle: data.market.title || "Bitcoin Up or Down",
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
      
      if (end.getTime() <= now.getTime()) {
        fetchMarketData();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [marketData?.endTime]);

  // Get asset IDs for Up and Down
  const upAssetId = marketData?.assetIds?.[0] || null;
  const downAssetId = marketData?.assetIds?.[1] || null;

  // Subscribe to both orderbooks
  const upOrderBookData = useCLOBOrderBook(upAssetId ? [upAssetId] : null);
  const downOrderBookData = useCLOBOrderBook(downAssetId ? [downAssetId] : null);

  // Store orderbook data
  useEffect(() => {
    if (upOrderBookData.orderBook) {
      setUpOrderBook(upOrderBookData.orderBook);
    }
  }, [upOrderBookData.orderBook]);

  useEffect(() => {
    if (downOrderBookData.orderBook) {
      setDownOrderBook(downOrderBookData.orderBook);
    }
  }, [downOrderBookData.orderBook]);

  // Get current orderbook based on active tab
  const currentOrderBook = activeTab === "up" ? upOrderBook : downOrderBook;
  const isConnected = activeTab === "up" ? upOrderBookData.isConnected : downOrderBookData.isConnected;

  // Use best_ask and best_bid directly from WebSocket (more reliable)
  const bestAskPrice = currentOrderBook?.bestAsk ? parseFloat(currentOrderBook.bestAsk) : null;
  const bestBidPrice = currentOrderBook?.bestBid ? parseFloat(currentOrderBook.bestBid) : null;

  // Calculate midpoint probability
  const midpoint = bestBidPrice && bestAskPrice 
    ? ((bestBidPrice + bestAskPrice) / 2).toFixed(4)
    : null;

  // Get asks and bids from orderbook
  const asks = currentOrderBook?.asks || [];
  const bids = currentOrderBook?.bids || [];
  
  // Limit to top 8 levels for display
  const displayAsks = asks.slice(0, 8);
  const displayBids = bids.slice(0, 8);

  // Calculate max depth for visualization
  const maxDepth = useMemo(() => {
    const askDepths = asks.map(a => parseFloat(a.size) * parseFloat(a.price));
    const bidDepths = bids.map(b => parseFloat(b.size) * parseFloat(b.price));
    return Math.max(...askDepths, ...bidDepths, 1);
  }, [asks, bids]);

  // Get current position for this market/side
  const selectedAssetId = activeTab === "up" ? upAssetId : downAssetId;
  const currentPosition = positions.find(
    (p) => p.marketId === marketData?.marketId && p.side === activeTab && p.assetId === selectedAssetId
  );

  // Format price for display (convert to cents)
  const formatPrice = (price: number | string | null): string => {
    if (price === null) return "—";
    const priceNum = typeof price === "string" ? parseFloat(price) : price;
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

  // Quick amount buttons
  const quickAmounts = [1, 20, 100];
  const handleQuickAmount = (amount: number) => {
    if (currentPosition && amount === -1) {
      // Max button - use position quantity
      setQuantity(currentPosition.quantity.toString());
    } else if (amount === -1) {
      // Max button - calculate max based on balance and price
      if (bestAskPrice && balance > 0) {
        const maxShares = Math.floor((balance / bestAskPrice) * 100) / 100;
        setQuantity(maxShares.toFixed(2));
      }
    } else {
      // Fixed amount buttons
      if (bestAskPrice) {
        const shares = Math.floor((amount / bestAskPrice) * 100) / 100;
        setQuantity(shares.toFixed(2));
      } else {
        setQuantity(amount.toString());
      }
    }
  };

  // Handle buy
  const handleBuy = () => {
    if (!marketData?.marketId || !marketData?.marketTitle || !selectedAssetId) {
      setTradeMessage({ type: "error", text: "Market data not loaded" });
      return;
    }

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      setTradeMessage({ type: "error", text: "Invalid quantity" });
      return;
    }

    if (!bestAskPrice) {
      setTradeMessage({ type: "error", text: "No ask price available" });
      return;
    }

    const result = buy(
      marketData.marketId,
      marketData.marketTitle,
      activeTab,
      selectedAssetId,
      bestAskPrice,
      qty,
      marketData.endTime
    );

    setTradeMessage({ type: result.success ? "success" : "error", text: result.message });
    setTimeout(() => setTradeMessage(null), 3000);
    
    if (result.success) {
      setQuantity("1"); // Reset quantity after successful trade
    }
  };

  // Handle sell
  const handleSell = () => {
    if (!marketData?.marketId || !marketData?.marketTitle || !selectedAssetId) {
      setTradeMessage({ type: "error", text: "Market data not loaded" });
      return;
    }

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      setTradeMessage({ type: "error", text: "Invalid quantity" });
      return;
    }

    if (!bestBidPrice) {
      setTradeMessage({ type: "error", text: "No bid price available" });
      return;
    }

    if (!currentPosition || currentPosition.quantity < qty) {
      setTradeMessage({ type: "error", text: "Insufficient position" });
      return;
    }

    const result = sell(
      marketData.marketId,
      marketData.marketTitle,
      activeTab,
      selectedAssetId,
      bestBidPrice,
      qty
    );

    setTradeMessage({ type: result.success ? "success" : "error", text: result.message });
    setTimeout(() => setTradeMessage(null), 3000);
    
    if (result.success) {
      setQuantity("1"); // Reset quantity after successful trade
    }
  };

  // Calculate trade cost
  const tradeCost = useMemo(() => {
    if (!bestAskPrice) return null;
    const qty = parseFloat(quantity) || 0;
    return bestAskPrice * qty;
  }, [bestAskPrice, quantity]);

  return (
    <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
      {/* Header */}
      <div className="border-b border-zinc-800 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Order Book</h3>
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${isConnected ? "bg-green-500" : "bg-zinc-500"}`} />
            <span className="text-xs text-zinc-400">
              {isConnected ? "Live" : "Connecting..."}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("up")}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
              activeTab === "up"
                ? "bg-green-500/20 text-green-400 shadow-lg shadow-green-500/10"
                : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            Up {upOrderBook?.bestAsk ? formatPrice(upOrderBook.bestAsk) : "—"}
          </button>
          <button
            onClick={() => setActiveTab("down")}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
              activeTab === "down"
                ? "bg-red-500/20 text-red-400 shadow-lg shadow-red-500/10"
                : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            Down {downOrderBook?.bestAsk ? formatPrice(downOrderBook.bestAsk) : "—"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-3">
        {/* Orderbook */}
        <div className="md:col-span-2">
          <div className="flex gap-4">
            {/* Asks (Sell Orders) */}
            <div className="flex-1">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-red-400">Asks</span>
                <span className="text-xs text-zinc-500">Price • Size</span>
              </div>
              <div className="space-y-0.5">
                {displayAsks.length > 0 ? (
                  displayAsks.map((ask, i) => {
                    const depth = (parseFloat(ask.size) * parseFloat(ask.price)) / maxDepth;
                    return (
                      <div
                        key={`ask-${i}`}
                        className="group relative flex items-center justify-between rounded px-2 py-1 text-xs transition-colors hover:bg-red-500/10"
                      >
                        <div
                          className="absolute left-0 top-0 h-full rounded bg-red-500/10 transition-all"
                          style={{ width: `${depth * 100}%` }}
                        />
                        <span className="relative z-10 font-medium text-red-400">
                          {formatPrice(ask.price)}
                        </span>
                        <span className="relative z-10 text-zinc-300">
                          {formatShares(ask.size)}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    {isConnected ? "No asks available" : "Connecting..."}
                  </div>
                )}
              </div>
            </div>

            {/* Spread & Midpoint */}
            <div className="flex flex-col items-center justify-center gap-2 border-x border-zinc-800 px-4">
              {midpoint && (
                <>
                  <div className="text-center">
                    <div className="text-xs text-zinc-500">Midpoint</div>
                    <div className="text-sm font-semibold text-white">
                      {formatPrice(parseFloat(midpoint))}
                    </div>
                  </div>
                  {currentOrderBook?.spread && (
                    <div className="text-center">
                      <div className="text-xs text-zinc-500">Spread</div>
                      <div className="text-xs font-medium text-yellow-400">
                        {formatPrice(currentOrderBook.spread)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Bids (Buy Orders) */}
            <div className="flex-1">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-green-400">Bids</span>
                <span className="text-xs text-zinc-500">Price • Size</span>
              </div>
              <div className="space-y-0.5">
                {displayBids.length > 0 ? (
                  displayBids.map((bid, i) => {
                    const depth = (parseFloat(bid.size) * parseFloat(bid.price)) / maxDepth;
                    return (
                      <div
                        key={`bid-${i}`}
                        className="group relative flex items-center justify-between rounded px-2 py-1 text-xs transition-colors hover:bg-green-500/10"
                      >
                        <div
                          className="absolute right-0 top-0 h-full rounded bg-green-500/10 transition-all"
                          style={{ width: `${depth * 100}%` }}
                        />
                        <span className="relative z-10 text-zinc-300">
                          {formatShares(bid.size)}
                        </span>
                        <span className="relative z-10 font-medium text-green-400">
                          {formatPrice(bid.price)}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    {isConnected ? "No bids available" : "Connecting..."}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Last Trade */}
          {currentOrderBook?.lastTradePrice && (
            <div className="mt-4 text-center text-xs text-zinc-500">
              Last: <span className="text-zinc-300">{formatPrice(currentOrderBook.lastTradePrice)}</span>
            </div>
          )}
        </div>

        {/* Trading Panel */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Amount</span>
              {tradeCost && (
                <span className="text-xs text-zinc-500">
                  ${tradeCost.toFixed(2)}
                </span>
              )}
            </div>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min="0.01"
              step="0.01"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm font-medium text-white placeholder-zinc-500 transition-all focus:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="0.00"
            />
          </div>

          {/* Quick Amount Buttons */}
          <div className="mb-4 grid grid-cols-4 gap-2">
            {quickAmounts.map((amount) => (
              <button
                key={amount}
                onClick={() => handleQuickAmount(amount)}
                className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-2 py-1.5 text-xs font-medium text-zinc-300 transition-all hover:bg-zinc-700 hover:text-white"
              >
                +${amount}
              </button>
            ))}
            <button
              onClick={() => handleQuickAmount(-1)}
              className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-2 py-1.5 text-xs font-medium text-zinc-300 transition-all hover:bg-zinc-700 hover:text-white"
            >
              Max
            </button>
          </div>

          {/* Current Position */}
          {currentPosition && (
            <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
              <div className="mb-1 text-xs text-zinc-400">Position</div>
              <div className="text-sm font-semibold text-white">
                {currentPosition.quantity.toFixed(2)} @ {formatPrice(currentPosition.entryPrice)}
              </div>
            </div>
          )}

          {/* Buy/Sell Buttons */}
          <div className="space-y-2">
            <button
              onClick={handleBuy}
              disabled={!bestAskPrice || !isConnected || !quantity || parseFloat(quantity) <= 0}
              className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-green-600/20 transition-all hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              Buy {bestAskPrice ? formatPrice(bestAskPrice) : "—"}
            </button>
            <button
              onClick={handleSell}
              disabled={!bestBidPrice || !isConnected || !currentPosition || !quantity || parseFloat(quantity) <= 0}
              className="w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-red-600/20 transition-all hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              Sell {bestBidPrice ? formatPrice(bestBidPrice) : "—"}
            </button>
          </div>

          {/* Trade Message */}
          {tradeMessage && (
            <div
              className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                tradeMessage.type === "success"
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              {tradeMessage.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
