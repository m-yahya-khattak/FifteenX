"use client";

import Portfolio from "./Portfolio";
import TradeHistory from "./TradeHistory";

export default function TradingPanel() {
  return (
    <div className="space-y-4">
      <Portfolio />
      <TradeHistory />
    </div>
  );
}

