"use client";

import { useVirtualTrading, Position } from "../hooks/useVirtualTrading";
import { useState, useMemo } from "react";

export default function Portfolio() {
  const { balance, positions, calculatePositionPnL, getPortfolioValue, closePosition } = useVirtualTrading();
  const [activeTab, setActiveTab] = useState<"positions" | "overview">("overview");

  // Create a map of assetId -> current price
  // For now, we'll use entry price as current price (can be enhanced later with live prices)
  const currentPrices = useMemo(() => {
    const priceMap = new Map<string, number>();
    positions.forEach((pos) => {
      // Use entry price as current price (will be updated when we have live orderbook data)
      // This is a simplified approach - in production, you'd subscribe to orderbooks for each asset
      if (!priceMap.has(pos.assetId)) {
        priceMap.set(pos.assetId, pos.entryPrice);
      }
    });
    return priceMap;
  }, [positions]);

  // Calculate total P&L
  const totalPnL = useMemo(() => {
    return positions.reduce((sum, pos) => {
      const currentPrice = currentPrices.get(pos.assetId) || pos.entryPrice;
      return sum + calculatePositionPnL(pos, currentPrice);
    }, 0);
  }, [positions, currentPrices, calculatePositionPnL]);

  // Calculate portfolio value
  const portfolioValue = getPortfolioValue(currentPrices);

  // Format currency
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Format price (cents)
  const formatPrice = (price: number): string => {
    return `${(price * 100).toFixed(0)}¢`;
  };

  // Handle close position
  const handleClosePosition = (position: Position) => {
    const currentPrice = currentPrices.get(position.assetId) || position.entryPrice;
    closePosition(position.id, currentPrice);
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Portfolio</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === "overview"
                ? "bg-blue-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("positions")}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              activeTab === "positions"
                ? "bg-blue-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            Positions ({positions.length})
          </button>
        </div>
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* Balance */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-4">
            <div className="mb-1 text-xs text-zinc-400">Available Balance</div>
            <div className="text-2xl font-bold text-white">{formatCurrency(balance)}</div>
          </div>

          {/* Portfolio Value */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-4">
            <div className="mb-1 text-xs text-zinc-400">Portfolio Value</div>
            <div className="text-2xl font-bold text-white">{formatCurrency(portfolioValue)}</div>
            <div className={`mt-1 text-xs ${totalPnL >= 0 ? "text-green-400" : "text-red-400"}`}>
              {totalPnL >= 0 ? "+" : ""}{formatCurrency(totalPnL)} P&L
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-3">
              <div className="text-xs text-zinc-400">Open Positions</div>
              <div className="mt-1 text-lg font-semibold text-white">{positions.length}</div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-3">
              <div className="text-xs text-zinc-400">Total Invested</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {formatCurrency(positions.reduce((sum, p) => sum + p.entryValue, 0))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "positions" && (
        <div className="space-y-2">
          {positions.length === 0 ? (
            <div className="py-8 text-center text-sm text-zinc-500">No open positions</div>
          ) : (
            positions.map((position) => {
              const currentPrice = currentPrices.get(position.assetId) || position.entryPrice;
              const pnl = calculatePositionPnL(position, currentPrice);
              const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

              return (
                <div
                  key={position.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-3"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-white">{position.marketTitle}</div>
                      <div className="text-xs text-zinc-400">
                        {position.side === "up" ? "Up" : "Down"} • {position.quantity.toFixed(2)} shares
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-semibold ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {pnl >= 0 ? "+" : ""}{formatCurrency(pnl)}
                      </div>
                      <div className={`text-xs ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {pnlPercent >= 0 ? "+" : ""}{pnlPercent.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                  <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-zinc-400">Entry: </span>
                      <span className="text-white">{formatPrice(position.entryPrice)}</span>
                    </div>
                    <div>
                      <span className="text-zinc-400">Current: </span>
                      <span className="text-white">{formatPrice(currentPrice)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleClosePosition(position)}
                    className="w-full rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                  >
                    Close Position
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

