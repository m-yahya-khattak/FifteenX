"use client";

import { useState } from "react";

export default function TradingPanel() {
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0");

  const quickAdd = (value: string) => {
    if (value === "Max") {
      setAmount("1000");
    } else {
      const current = parseFloat(amount) || 0;
      const add = parseFloat(value.replace("$", "")) || 0;
      setAmount((current + add).toString());
    }
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      {/* Tabs */}
      <div className="mb-4 flex gap-2 border-b border-zinc-800">
        <button
          onClick={() => setActiveTab("buy")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "buy"
              ? "border-blue-500 text-white"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setActiveTab("sell")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "sell"
              ? "border-blue-500 text-white"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          Sell
        </button>
      </div>

      {/* Market Dropdown */}
      <div className="mb-4">
        <select className="w-full rounded-lg border border-zinc-800 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-zinc-700 focus:outline-none">
          <option>Market</option>
        </select>
      </div>

      {/* Up/Down Buttons */}
      <div className="mb-4 flex gap-2">
        <button className="flex-1 rounded-lg bg-green-600 px-3 py-3 text-base font-semibold text-white hover:bg-green-700 sm:px-4 sm:py-4 sm:text-lg">
          Up 60¢
        </button>
        <button className="flex-1 rounded-lg bg-zinc-700 px-3 py-3 text-base font-semibold text-white hover:bg-zinc-600 sm:px-4 sm:py-4 sm:text-lg">
          Down 41¢
        </button>
      </div>

      {/* Amount Section */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm text-zinc-400">Amount</span>
          <span className="text-sm text-zinc-400">Balance $0.00</span>
        </div>
        <div className="mb-2 rounded-lg border border-zinc-800 bg-zinc-800 p-3 sm:p-4">
          <div className="text-2xl font-bold text-white sm:text-3xl">${amount}</div>
        </div>
        <div className="flex gap-2">
          {["$1", "$20", "$100", "Max"].map((value) => (
            <button
              key={value}
              onClick={() => quickAdd(value)}
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              +{value}
            </button>
          ))}
        </div>
      </div>

      {/* Deposit Button */}
      <button className="mb-4 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700">
        Deposit
      </button>

      {/* Legal Text */}
      <p className="text-xs text-zinc-500">
        By trading, you agree to the{" "}
        <a href="#" className="text-blue-400 hover:underline">
          Terms of Use
        </a>
        .
      </p>
    </div>
  );
}

