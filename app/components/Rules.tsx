"use client";

import { useState } from "react";

export default function Rules() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="mb-3 text-lg font-semibold text-white">Rules</h3>
      <p className="text-sm text-zinc-300">
        This market will resolve to "Up" if the Bitcoin price at the end of the
        time range specified in the title is greater than or equal to the price
        at the beginning of that range. Otherwise, it will resolve to "Down".
      </p>
      {expanded && (
        <div className="mt-3 text-sm text-zinc-300">
          <p className="mb-2">
            The resolution source for this market is information from Chainlink,
            specifically the BTC/USD data stream available at{" "}
            <a
              href="https://data.chain.link/streams/btc-usd"
              className="text-blue-400 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              https://data.chain.link/streams/btc-usd
            </a>
            .
          </p>
          <p>
            Please note that this market is about the price according to
            Chainlink data stream BTC/USD, not according to other sources or
            spot markets.
          </p>
        </div>
      )}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-2 flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
      >
        {expanded ? "Show less" : "Show more"}
        <svg
          className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
    </div>
  );
}

