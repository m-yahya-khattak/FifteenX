"use client";

import { useEffect, useState } from "react";

interface MarketData {
  id?: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  referencePrice?: number;
  currentPrice?: number;
}

export default function MarketHeader() {
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Format date to readable format
  const formatTimeRange = (startTime?: string, endTime?: string) => {
    if (!startTime || !endTime) return "Loading...";
    
    try {
      const start = new Date(startTime);
      const end = new Date(endTime);
      
      const startFormatted = start.toLocaleString("en-US", {
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZoneName: "short",
      });
      
      const endFormatted = end.toLocaleString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      
      return `${startFormatted} - ${endFormatted}`;
    } catch {
      return "Invalid date";
    }
  };

  // Calculate countdown
  const calculateCountdown = (endTime?: string) => {
    if (!endTime) return "";
    
    try {
      const end = new Date(endTime);
      const now = new Date();
      const diff = end.getTime() - now.getTime();
      
      if (diff <= 0) return "Ended";
      
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      
      return `${minutes} MINS ${seconds} SECS`;
    } catch {
      return "";
    }
  };

  // Calculate price change
  const calculatePriceChange = (reference?: number, current?: number) => {
    if (!reference || !current) return null;
    return current - reference;
  };

  // Fetch market data
  const fetchMarketData = async () => {
    try {
      // First, get list of markets to find a 15-minute BTC market
      const marketsResponse = await fetch("/api/markets?query=btc&limit=5");
      const marketsData = await marketsResponse.json();
      
      if (!marketsData.success || !marketsData.market) {
        setError("No active 15-minute BTC market found");
        setLoading(false);
        return;
      }

      const market = marketsData.market;
      setMarketData({
        id: market.id || market.slug,
        title: market.title || market.question || "Bitcoin Up or Down",
        startTime: market.startTime || market.startDate || market.start_time || market.createdAt,
        endTime: market.endTime || market.endDate || market.end_time,
        referencePrice: market.referencePrice || market.reference_price || market.price_to_beat || market.priceToBeat || 88630.18, // Fallback to static if not in API
      });

      // Keep price static for now (price route is failing)
      // Set static current price
      setCurrentPrice(88637.72);

      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load market data");
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchMarketData();
  }, []);

  // Update countdown every second
  useEffect(() => {
    const interval = setInterval(() => {
      if (marketData?.endTime) {
        setCountdown(calculateCountdown(marketData.endTime));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [marketData?.endTime]);

  // Price refresh disabled - keeping static for now
  // useEffect(() => {
  //   if (!marketData?.id) return;
  //
  //   const interval = setInterval(async () => {
  //     try {
  //       const priceResponse = await fetch(`/api/market/${marketData.id}/price`);
  //       const priceData = await priceResponse.json();
  //       
  //       if (priceData.success && priceData.currentPrice) {
  //         setCurrentPrice(priceData.currentPrice);
  //       }
  //     } catch (err) {
  //       console.error("Failed to refresh price:", err);
  //     }
  //   }, 3000);
  //
  //   return () => clearInterval(interval);
  // }, [marketData?.id]);

  if (loading) {
    return (
      <div className="mb-6">
        <div className="text-center text-zinc-400">Loading market data...</div>
      </div>
    );
  }

  if (error || !marketData) {
    return (
      <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4">
        <div className="text-red-400">Error: {error || "Failed to load market"}</div>
      </div>
    );
  }

  const priceChange = calculatePriceChange(marketData.referencePrice, currentPrice);
  const priceChangeFormatted = priceChange !== null 
    ? `${priceChange >= 0 ? "+" : ""}$${priceChange.toFixed(2)}`
    : null;

  return (
    <div className="mb-6">
      {/* Market Title */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white sm:h-8 sm:w-8 sm:text-sm">
          B
        </div>
        <div>
          <h1 className="text-xl font-bold text-white sm:text-2xl">
            {marketData.title || "Bitcoin Up or Down"}
          </h1>
          <p className="text-xs text-zinc-400 sm:text-sm">
            {formatTimeRange(marketData.startTime, marketData.endTime)}
          </p>
        </div>
      </div>

      {/* Price Info */}
      <div className="mb-4 flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs text-zinc-400">PRICE TO BEAT</div>
          <div className="text-lg font-bold text-white sm:text-xl">
            {marketData.referencePrice 
              ? `$${marketData.referencePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "Loading..."}
          </div>
        </div>
        <div className="text-left sm:text-right">
          <div className="text-xs text-zinc-400">CURRENT PRICE</div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white sm:text-xl">
              {currentPrice 
                ? `$${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "Loading..."}
            </span>
            {priceChangeFormatted && (
              <span
                className={`rounded px-2 py-1 text-xs font-semibold ${
                  priceChange >= 0
                    ? "bg-green-500/20 text-green-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {priceChangeFormatted}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Countdown Timer */}
      {countdown && (
        <div className="flex items-center gap-2 text-red-500">
          <svg
            className="h-4 w-4 sm:h-5 sm:w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-base font-bold sm:text-lg">{countdown}</span>
        </div>
      )}
    </div>
  );
}
