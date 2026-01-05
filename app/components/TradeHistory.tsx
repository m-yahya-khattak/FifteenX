"use client";

import { useVirtualTrading } from "../hooks/useVirtualTrading";
import { useState } from "react";

export default function TradeHistory() {
  const { tradeHistory } = useVirtualTrading();
  const [showAll, setShowAll] = useState(false);

  const displayHistory = showAll ? tradeHistory : tradeHistory.slice(0, 10);

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPrice = (price: number): string => {
    return `${(price * 100).toFixed(0)}¢`;
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Trade History</h3>
        {tradeHistory.length > 10 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            {showAll ? "Show Less" : `Show All (${tradeHistory.length})`}
          </button>
        )}
      </div>

      {displayHistory.length === 0 ? (
        <div className="py-8 text-center text-sm text-zinc-500">No trades yet</div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {displayHistory.map((trade) => (
            <div
              key={trade.id}
              className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-3"
            >
              <div className="mb-1 flex items-start justify-between">
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">{trade.marketTitle}</div>
                  <div className="text-xs text-zinc-400">
                    {trade.side === "up" ? "Up" : "Down"} • {formatTime(trade.timestamp)}
                  </div>
                </div>
                <div className={`text-sm font-semibold ${
                  trade.type === "buy" ? "text-blue-400" : "text-purple-400"
                }`}>
                  {trade.type === "buy" ? "BUY" : "SELL"}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-zinc-400">Price: </span>
                  <span className="text-white">{formatPrice(trade.price)}</span>
                </div>
                <div>
                  <span className="text-zinc-400">Qty: </span>
                  <span className="text-white">{trade.quantity.toFixed(2)}</span>
                </div>
                <div className="text-right">
                  <span className="text-zinc-400">Value: </span>
                  <span className="text-white">{formatCurrency(trade.value)}</span>
                </div>
              </div>
              {trade.pnl !== undefined && (
                <div className={`mt-2 text-xs font-medium ${
                  trade.pnl >= 0 ? "text-green-400" : "text-red-400"
                }`}>
                  P&L: {trade.pnl >= 0 ? "+" : ""}{formatCurrency(trade.pnl)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


