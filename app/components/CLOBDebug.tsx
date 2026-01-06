"use client";

import { useState } from "react";
import { useCLOBOrderBook } from "../hooks/useCLOBOrderBook";

interface CLOBDebugProps {
  assetIds: string[] | null;
}

export default function CLOBDebug({ assetIds }: CLOBDebugProps) {
  const { orderBook, isConnected, connectionStatus, rawMessages } = useCLOBOrderBook(assetIds);
  const [expandedMessage, setExpandedMessage] = useState<number | null>(null);

  // Calculate midpoint probability
  const midpoint = orderBook.bestBid && orderBook.bestAsk
    ? ((parseFloat(orderBook.bestBid) + parseFloat(orderBook.bestAsk)) / 2).toFixed(4)
    : null;

  return (
    <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-xs">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">CLOB WebSocket Debug</h3>
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              connectionStatus === "connected"
                ? "bg-green-500"
                : connectionStatus === "connecting"
                ? "bg-yellow-500"
                : connectionStatus === "error"
                ? "bg-red-500"
                : "bg-gray-500"
            }`}
          />
          <span className="text-zinc-400">{connectionStatus}</span>
        </div>
      </div>

      {/* Current State Summary */}
      <div className="mb-4 space-y-2 rounded border border-zinc-700 bg-zinc-800/50 p-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-zinc-500">Best Bid</div>
            <div className="text-green-400 font-mono">{orderBook.bestBid || "—"}</div>
          </div>
          <div>
            <div className="text-zinc-500">Best Ask</div>
            <div className="text-red-400 font-mono">{orderBook.bestAsk || "—"}</div>
          </div>
          <div>
            <div className="text-zinc-500">Midpoint (Prob)</div>
            <div className="text-blue-400 font-mono">{midpoint || "—"}</div>
          </div>
          <div>
            <div className="text-zinc-500">Spread</div>
            <div className="text-yellow-400 font-mono">{orderBook.spread || "—"}</div>
          </div>
          <div>
            <div className="text-zinc-500">Last Trade</div>
            <div className="text-purple-400 font-mono">{orderBook.lastTradePrice || "—"}</div>
          </div>
          <div>
            <div className="text-zinc-500">Bids Count</div>
            <div className="text-white font-mono">{orderBook.bids.length}</div>
          </div>
          <div>
            <div className="text-zinc-500">Asks Count</div>
            <div className="text-white font-mono">{orderBook.asks.length}</div>
          </div>
          <div>
            <div className="text-zinc-500">Messages</div>
            <div className="text-white font-mono">{rawMessages.length}</div>
          </div>
        </div>
      </div>

      {/* Raw Messages */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-zinc-300">Raw Messages ({rawMessages.length})</h4>
          <button
            onClick={() => setExpandedMessage(null)}
            className="text-zinc-500 hover:text-white"
          >
            Collapse All
          </button>
        </div>
        <div className="max-h-[600px] space-y-1 overflow-y-auto">
          {rawMessages.length === 0 ? (
            <div className="text-center text-zinc-500 py-4">No messages yet...</div>
          ) : (
            rawMessages
              .slice()
              .reverse()
              .map((msg, index) => {
                const actualIndex = rawMessages.length - 1 - index;
                const isExpanded = expandedMessage === actualIndex;
                return (
                  <div
                    key={actualIndex}
                    className="rounded border border-zinc-700 bg-zinc-800/30 p-2"
                  >
                    <div
                      className="flex cursor-pointer items-center justify-between"
                      onClick={() =>
                        setExpandedMessage(isExpanded ? null : actualIndex)
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500">#{actualIndex}</span>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                            msg.event_type === "book"
                              ? "bg-blue-500/20 text-blue-400"
                              : msg.event_type === "price_change"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : msg.event_type === "best_bid_ask"
                              ? "bg-green-500/20 text-green-400"
                              : msg.event_type === "last_trade_price"
                              ? "bg-purple-500/20 text-purple-400"
                              : "bg-zinc-500/20 text-zinc-400"
                          }`}
                        >
                          {msg.event_type}
                        </span>
                        <span className="text-zinc-400 text-[10px]">
                          {msg.receivedAt
                            ? new Date(msg.receivedAt).toLocaleTimeString()
                            : ""}
                        </span>
                      </div>
                      <span className="text-zinc-500">{isExpanded ? "▼" : "▶"}</span>
                    </div>
                    {isExpanded && (
                      <pre className="mt-2 max-h-96 overflow-auto rounded bg-zinc-900 p-2 text-[10px] text-zinc-300">
                        {JSON.stringify(msg, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })
          )}
        </div>
      </div>
    </div>
  );
}

