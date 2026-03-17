"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Backtest {
  id: number;
  timestamp: number;
  durationMinutes: number;
  initialCapital: number;
  finalBalance: number;
  totalPnL: number;
  maxDrawdownPercent: number;
  riskOfLoss: number;
  winRate: number;
  totalTrades: number;
}

export default function BacktestHistory() {
  const [backtests, setBacktests] = useState<Backtest[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const fetchBacktests = async () => {
    try {
      const response = await fetch("/api/backtests?limit=20");
      const data = await response.json();
      if (data.success) {
        setBacktests(data.backtests);
      }
    } catch (error) {
      console.error("Failed to fetch backtests:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBacktests();
    const interval = setInterval(fetchBacktests, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const handleClearAll = async () => {
    if (!confirm("Are you sure you want to delete all backtest history? This cannot be undone.")) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch("/api/backtests", { method: "DELETE" });
      const data = await response.json();
      if (data.success) {
        setBacktests([]);
      }
    } catch (error) {
      console.error("Failed to delete backtests:", error);
      alert("Failed to delete backtests");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Backtest History</h2>
        <p className="text-zinc-500 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">Backtest History</h2>
        {backtests.length > 0 && (
          <button
            onClick={handleClearAll}
            disabled={deleting}
            className="px-3 py-1.5 text-sm rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Clear All"}
          </button>
        )}
      </div>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {backtests.length === 0 ? (
          <p className="text-zinc-500 text-sm">No backtests yet. Run a backtest to see results here.</p>
        ) : (
          backtests.map((backtest) => (
            <Link
              key={backtest.id}
              href={`/market-maker?backtest=${backtest.id}`}
              className="block p-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">
                    {new Date(backtest.timestamp).toLocaleString()}
                  </span>
                  <span className="text-xs text-zinc-500">
                    • {backtest.durationMinutes} min
                  </span>
                </div>
                <span
                  className={`text-sm font-semibold ${
                    (backtest.totalPnL ?? 0) >= 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {(backtest.totalPnL ?? 0) >= 0 ? "+" : ""}${(backtest.totalPnL ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-zinc-500">Capital:</span>
                  <span className="text-white ml-1">${backtest.initialCapital ?? 0}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Trades:</span>
                  <span className="text-white ml-1">{backtest.totalTrades ?? 0}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Win Rate:</span>
                  <span className="text-white ml-1">
                    {backtest.winRate != null ? backtest.winRate.toFixed(1) : "0.0"}%
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">Risk:</span>
                  <span
                    className={`ml-1 ${
                      (backtest.riskOfLoss ?? 0) > 50 ? "text-red-400" : 
                      (backtest.riskOfLoss ?? 0) > 30 ? "text-yellow-400" : 
                      "text-green-400"
                    }`}
                  >
                    {(backtest.riskOfLoss ?? 0).toFixed(0)}%
                  </span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

