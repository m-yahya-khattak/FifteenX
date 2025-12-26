"use client";

import { useState } from "react";

export default function OrderBook() {
  const [activeTab, setActiveTab] = useState<"up" | "down">("up");

  const asks = [
    { price: "67¢", shares: "285.40", total: "$654.02" },
    { price: "66¢", shares: "171.92", total: "$462.80" },
    { price: "65¢", shares: "450.00", total: "$349.33" },
    { price: "64¢", shares: "88.80", total: "$56.83" },
  ];

  const bids = [
    { price: "63¢", shares: "5.00", total: "$3.15" },
    { price: "62¢", shares: "35.22", total: "$24.99" },
    { price: "61¢", shares: "65.00", total: "$64.64" },
    { price: "60¢", shares: "390.00", total: "$298.64" },
  ];

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
            {asks.map((ask, i) => (
              <div
                key={i}
                className="grid grid-cols-3 gap-2 rounded bg-red-500/10 px-2 py-1 text-xs sm:text-sm"
              >
                <span className="font-medium text-red-400">{ask.price}</span>
                <span className="text-center text-zinc-300">{ask.shares}</span>
                <span className="text-right text-zinc-300">{ask.total}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-center text-xs text-zinc-400 sm:text-sm">
            Last: 64¢
          </div>
        </div>

        {/* Spread */}
        <div className="flex items-center justify-center text-xs text-zinc-500 md:flex-col">
          Spread: 1¢
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
            {bids.map((bid, i) => (
              <div
                key={i}
                className="grid grid-cols-3 gap-2 rounded bg-green-500/10 px-2 py-1 text-xs sm:text-sm"
              >
                <span className="font-medium text-green-400">{bid.price}</span>
                <span className="text-center text-zinc-300">{bid.shares}</span>
                <span className="text-right text-zinc-300">{bid.total}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

