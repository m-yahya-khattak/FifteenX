"use client";

import { useMemo } from "react";

interface MarketMakerVisualizationProps {
  orderBook: {
    bestBid: string | null;
    bestAsk: string | null;
    bids: Array<{ price: string; size: string }>;
    asks: Array<{ price: string; size: string }>;
  };
  orders: Array<{
    id: string;
    side: "BUY" | "SELL";
    price: number;
    size: number;
    filled?: boolean;
    filledSize?: number;
    assetId?: string;
  }>;
  assetIds?: string[] | null;
  config: {
    spreadBps: number;
    enabled: boolean;
    maxPosition?: number;
  };
  isConnected: boolean;
  performance: {
    inventory: number;
    balance: number;
    totalTrades: number;
  };
  actualSpreadBps?: number; // Actual spread being used (from adaptive controller or config)
}

export default function MarketMakerVisualization({
  orderBook,
  orders,
  config,
  isConnected,
  performance,
  assetIds,
  actualSpreadBps,
}: MarketMakerVisualizationProps) {
  const bestBid = orderBook.bestBid ? parseFloat(orderBook.bestBid) : null;
  const bestAsk = orderBook.bestAsk ? parseFloat(orderBook.bestAsk) : null;
  const midPrice = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : null;
  const marketSpread = bestBid && bestAsk ? bestAsk - bestBid : null;
  const marketSpreadBps = midPrice && marketSpread ? (marketSpread / midPrice) * 10000 : null;

  // Calculate our target spread - use actual spread if available, otherwise use config
  const effectiveSpreadBps = actualSpreadBps ?? config.spreadBps;
  const targetSpread = midPrice ? (effectiveSpreadBps / 10000) * midPrice : null;
  const targetBid = midPrice ? midPrice - targetSpread! / 2 : null;
  const targetAsk = midPrice ? midPrice + targetSpread! / 2 : null;

  // Active orders - group by asset
  const activeOrders = orders.filter((o) => !o.filled);
  const upAssetId = assetIds?.[0];
  const downAssetId = assetIds?.[1];
  const buyOrders = activeOrders.filter((o) => o.side === "BUY");
  const sellOrders = activeOrders.filter((o) => o.side === "SELL");
  
  // Helper to get asset label
  const getAssetLabel = (assetId?: string) => {
    if (assetId === upAssetId) return "YES";
    if (assetId === downAssetId) return "NO";
    return "?";
  };
  
  // Helper to get asset color
  const getAssetColor = (assetId?: string) => {
    if (assetId === upAssetId) return "blue";
    if (assetId === downAssetId) return "purple";
    return "zinc";
  };

  // Determine bot status
  const botStatus = useMemo(() => {
    // console.log("[DEBUG Status] Checking status - bestBid:", bestBid, "bestAsk:", bestAsk, "midPrice:", midPrice, "isConnected:", isConnected);
    if (!config.enabled) {
      return { status: "disabled", message: "Market maker is disabled", color: "zinc" };
    }
    // Check if we have asset IDs - if not, we're waiting for market discovery
    if (!assetIds || assetIds.length === 0) {
      return { status: "discovering", message: "Waiting for market discovery...", color: "yellow" };
    }
    if (!isConnected) {
      return { status: "connecting", message: "Connecting to WebSocket...", color: "yellow" };
    }
    if (!bestBid || !bestAsk || !midPrice) {
      return { status: "no_data", message: "Waiting for market data", color: "yellow" };
    }
    if (marketSpreadBps && marketSpreadBps < config.spreadBps * 0.5) {
      return {
        status: "spread_too_tight",
        message: `Market spread (${marketSpreadBps.toFixed(1)} bps) is too tight. Target: ${config.spreadBps} bps`,
        color: "yellow",
      };
    }
    if (activeOrders.length === 0) {
      return { status: "placing_orders", message: "Placing initial orders...", color: "blue" };
    }
    if (config.maxPosition && performance.inventory > config.maxPosition * 0.8) {
      return {
        status: "position_limit",
        message: `Position near limit (${performance.inventory.toFixed(2)})`,
        color: "orange",
      };
    }
    return {
      status: "active",
      message: `Active - ${activeOrders.length} orders, ${performance.totalTrades} trades`,
      color: "green",
    };
  }, [config.enabled, isConnected, bestBid, bestAsk, midPrice, marketSpreadBps, config.spreadBps, activeOrders.length, performance.inventory, config.maxPosition, performance.totalTrades, assetIds]);

  // Calculate price range for visualization
  const priceRange = useMemo(() => {
    if (!midPrice) return { min: 0, max: 1 };
    const range = targetSpread ? targetSpread * 3 : 0.1;
    return {
      min: midPrice - range,
      max: midPrice + range,
    };
  }, [midPrice, targetSpread]);

  const getPricePosition = (price: number) => {
    if (!priceRange.min || !priceRange.max) return 50;
    const range = priceRange.max - priceRange.min;
    if (range === 0) return 50;
    return ((price - priceRange.min) / range) * 100;
  };

  const statusColorClasses = {
    green: "bg-green-500/20 text-green-400",
    red: "bg-red-500/20 text-red-400",
    yellow: "bg-yellow-500/20 text-yellow-400",
    blue: "bg-blue-500/20 text-blue-400",
    orange: "bg-orange-500/20 text-orange-400",
    zinc: "bg-zinc-500/20 text-zinc-400",
  };

  const pulseColorClasses = {
    green: "bg-green-400",
    red: "bg-red-400",
    yellow: "bg-yellow-400",
    blue: "bg-blue-400",
    orange: "bg-orange-400",
    zinc: "bg-zinc-400",
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white">Market Maker Status</h2>
        <div className={`px-2 py-1 rounded text-xs font-medium ${statusColorClasses[botStatus.color as keyof typeof statusColorClasses] || statusColorClasses.zinc}`}>
          {botStatus.status.replace(/_/g, " ").toUpperCase()}
        </div>
      </div>

      {/* Status Message - Compact */}
      <div className="mb-4 p-3 rounded-lg bg-zinc-800 border border-zinc-700">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${pulseColorClasses[botStatus.color as keyof typeof pulseColorClasses] || pulseColorClasses.zinc}`} />
          <span className="text-xs text-zinc-300">{botStatus.message}</span>
        </div>
      </div>

      {/* Price Ladder Visualization - Compact */}
      {midPrice && (
        <div className="mb-4">
          <div className="text-xs text-zinc-400 mb-2">Price Ladder</div>
          <div className="relative h-48 bg-zinc-800 rounded-lg border border-zinc-700 overflow-hidden">
            {/* Market Spread Indicator */}
            {bestBid && bestAsk && (
              <>
                <div
                  className="absolute left-0 right-0 bg-blue-500/20 border-y border-blue-500/50"
                  style={{
                    top: `${100 - getPricePosition(bestAsk)}%`,
                    height: `${getPricePosition(bestAsk) - getPricePosition(bestBid)}%`,
                  }}
                >
                  <div className="absolute top-0 left-2 text-xs text-blue-400">
                    Market Spread: {marketSpreadBps?.toFixed(1)} bps
                  </div>
                </div>
              </>
            )}

            {/* Target Spread Indicator */}
            {targetBid && targetAsk && (
              <>
                <div
                  className="absolute left-0 right-0 bg-green-500/10 border-y border-green-500/30 border-dashed"
                  style={{
                    top: `${100 - getPricePosition(targetAsk)}%`,
                    height: `${getPricePosition(targetAsk) - getPricePosition(targetBid)}%`,
                  }}
                >
                  <div className="absolute bottom-0 left-2 text-xs text-green-400">
                    Target: {effectiveSpreadBps.toFixed(1)} bps
                  </div>
                </div>
              </>
            )}

            {/* Mid Price Line */}
            <div
              className="absolute left-0 right-0 border-t-2 border-zinc-500 border-dashed"
              style={{ top: `${100 - getPricePosition(midPrice)}%` }}
            >
              <div className="absolute left-2 -top-3 text-xs text-zinc-400 font-medium">
                Mid: ${(midPrice * 100).toFixed(2)}¢
              </div>
            </div>

            {/* Market Best Bid/Ask */}
            {bestBid && (
              <div
                className="absolute left-0 right-0 border-t border-green-500"
                style={{ top: `${100 - getPricePosition(bestBid)}%` }}
              >
                <div className="absolute left-2 -top-2 text-xs text-green-400">
                  Market Bid: ${(bestBid * 100).toFixed(2)}¢
                </div>
              </div>
            )}
            {bestAsk && (
              <div
                className="absolute left-0 right-0 border-t border-red-500"
                style={{ top: `${100 - getPricePosition(bestAsk)}%` }}
              >
                <div className="absolute left-2 -top-2 text-xs text-red-400">
                  Market Ask: ${(bestAsk * 100).toFixed(2)}¢
                </div>
              </div>
            )}

            {/* Our Orders */}
            {buyOrders.map((order) => (
              <div
                key={order.id}
                className="absolute left-1/4 right-0 bg-green-500/30 border-l-2 border-green-400"
                style={{ top: `${100 - getPricePosition(order.price)}%`, height: "2%" }}
              >
                <div className="absolute left-2 top-0 text-xs text-green-300 font-medium">
                  {getAssetLabel(order.assetId)} Bid: ${(order.price * 100).toFixed(2)}¢ ({order.size.toFixed(1)})
                </div>
              </div>
            ))}
            {sellOrders.map((order) => (
              <div
                key={order.id}
                className="absolute left-1/4 right-0 bg-red-500/30 border-l-2 border-red-400"
                style={{ top: `${100 - getPricePosition(order.price)}%`, height: "2%" }}
              >
                <div className="absolute left-2 top-0 text-xs text-red-300 font-medium">
                  {getAssetLabel(order.assetId)} Ask: ${(order.price * 100).toFixed(2)}¢ ({order.size.toFixed(1)})
                </div>
              </div>
            ))}

            {/* Price Scale */}
            <div className="absolute right-2 top-2 bottom-2 w-12 border-l border-zinc-600">
              {[0, 25, 50, 75, 100].map((percent) => {
                const price = priceRange.min + ((100 - percent) / 100) * (priceRange.max - priceRange.min);
                return (
                  <div
                    key={percent}
                    className="absolute right-1 text-xs text-zinc-500"
                    style={{ top: `${percent}%` }}
                  >
                    ${(price * 100).toFixed(2)}¢
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats - Compact */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-zinc-800 rounded-lg p-2">
          <div className="text-xs text-zinc-500 mb-0.5">Orders</div>
          <div className="text-sm font-semibold text-white">{activeOrders.length}</div>
        </div>
        <div className="bg-zinc-800 rounded-lg p-2">
          <div className="text-xs text-zinc-500 mb-0.5">Inventory</div>
          <div className={`text-sm font-semibold ${performance.inventory >= 0 ? "text-green-400" : "text-red-400"}`}>
            {performance.inventory >= 0 ? "+" : ""}{performance.inventory.toFixed(1)}
          </div>
        </div>
        <div className="bg-zinc-800 rounded-lg p-2">
          <div className="text-xs text-zinc-500 mb-0.5">Trades</div>
          <div className="text-sm font-semibold text-white">{performance.totalTrades}</div>
        </div>
      </div>
    </div>
  );
}

