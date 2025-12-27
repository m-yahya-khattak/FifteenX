"use client";

import { useEffect, useState } from "react";
import { useRTDS } from "../hooks/useRTDS";

interface MarketData {
  id?: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  referencePrice?: number;
  currentPrice?: number;
  referencePriceStatus?: {
    found: boolean;
    source: string;
    value: number | null;
  };
}

export default function MarketHeader() {
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [countdown, setCountdown] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Get real-time price from RTDS
  const rtds = useRTDS();
  const currentPrice = rtds.lastPrice;

  // Format date to readable format in user's local timezone
  // Format: "December 26, 8:30AM-8:45AM GMT+7" (shows user's timezone)
  const formatTimeRange = (startTime?: string, endTime?: string) => {
    if (!startTime || !endTime) return "Loading...";
    
    try {
      const start = new Date(startTime);
      const end = new Date(endTime);
      
      // Get month and day in local timezone using toLocaleString for consistency
      const month = start.toLocaleString("en-US", { month: "long" });
      const day = start.toLocaleString("en-US", { day: "numeric" });
      
      // Format times in user's local timezone
      const startTimeFormatted = start.toLocaleString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      
      const endTimeFormatted = end.toLocaleString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      
      // Get timezone abbreviation (e.g., "GMT+7", "EST", "PST")
      const timeZoneName = Intl.DateTimeFormat("en-US", {
        timeZoneName: "short",
      })
        .formatToParts(start)
        .find((part) => part.type === "timeZoneName")?.value || "";
      
      return `${month} ${day}, ${startTimeFormatted}-${endTimeFormatted} ${timeZoneName}`;
    } catch {
      return "Invalid date";
    }
  };

  // Format date for title in user's local timezone
  // Format: "December 26, 8:30AM-8:45AM" (local timezone, no timezone label)
  const formatTimeRangeLocal = (startTime?: string, endTime?: string) => {
    if (!startTime || !endTime) return "Loading...";
    
    try {
      const start = new Date(startTime);
      const end = new Date(endTime);
      
      // Get month and day in local timezone
      const month = start.toLocaleString("en-US", { month: "long" });
      const day = start.getDate();
      
      // Format times in user's local timezone
      const startTimeFormatted = start.toLocaleString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      
      const endTimeFormatted = end.toLocaleString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      
      return `${month} ${day}, ${startTimeFormatted}-${endTimeFormatted}`;
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
  const calculatePriceChange = (reference?: number | null, current?: number | null) => {
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
      
      // Extract timestamp from slug (format: btc-updown-15m-{timestamp})
      // Calculate proper start/end times from the timestamp to ensure 15-minute boundaries
      let calculatedStartTime: string | undefined;
      let calculatedEndTime: string | undefined;
      
      if (market.slug) {
        const slugMatch = market.slug.match(/btc-updown-15m-(\d+)/);
        if (slugMatch) {
          const timestamp = parseInt(slugMatch[1], 10); // Unix timestamp in seconds
          // Start time is the timestamp
          calculatedStartTime = new Date(timestamp * 1000).toISOString();
          // End time is 15 minutes later (900 seconds)
          calculatedEndTime = new Date((timestamp + 900) * 1000).toISOString();
        }
      }
      
      // Clean title - remove time range pattern if present
      let cleanTitle = market.title || market.question || "Bitcoin Up or Down";
      // Remove pattern like " - December 27, 8:15AM-8:30AM ET" or similar
      cleanTitle = cleanTitle.replace(/\s*-\s*\w+\s+\d+,\s*\d+:\d+\w+-\d+:\d+\w+\s+\w+.*$/i, "").trim();
      
      setMarketData({
        id: market.id || market.slug,
        title: cleanTitle,
        // Use calculated times from slug timestamp if available, otherwise fall back to API times
        startTime: calculatedStartTime || market.startTime || market.startDate || market.start_time || market.createdAt,
        endTime: calculatedEndTime || market.endTime || market.endDate || market.end_time,
        referencePrice: market.referencePrice || market.reference_price || market.price_to_beat || market.priceToBeat || null,
        referencePriceStatus: market.referencePriceStatus,
      });

      // Current price will come from RTDS hook automatically
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

  // Update countdown every second and check for new market
  useEffect(() => {
    const interval = setInterval(() => {
      if (marketData?.endTime) {
        const countdownValue = calculateCountdown(marketData.endTime);
        setCountdown(countdownValue);
        
        // If market has ended, fetch next market
        if (countdownValue === "Ended" || countdownValue === "") {
          console.log("Market ended, fetching next market...");
          fetchMarketData();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [marketData?.endTime]);

  // Auto-refresh: Check for new market every 2 minutes as backup
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      if (marketData?.endTime) {
        const end = new Date(marketData.endTime);
        const now = new Date();
        // If market ended or will end soon, refresh
        if (end.getTime() <= now.getTime() + 60000) { // 1 minute before or after
          console.log("Auto-refreshing market data...");
          fetchMarketData();
        }
      }
    }, 120000); // Every 2 minutes

    return () => clearInterval(refreshInterval);
  }, [marketData?.endTime]);

  // Price updates automatically from RTDS hook - no polling needed

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
  
  const hasPriceChange = priceChange !== null;

  return (
    <div className="mb-6">
      {/* Market Title */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white sm:h-8 sm:w-8 sm:text-sm">
          B
        </div>
        <div>
          <h1 className="text-xl font-bold text-white sm:text-2xl">
            Bitcoin Up or Down - 15 Minutes Market
          </h1>
          <p className="text-xs text-zinc-400 sm:text-sm">
            {formatTimeRange(marketData.startTime, marketData.endTime)}
          </p>
        </div>
      </div>

      {/* Price Info */}
      <div className="mb-4 flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-zinc-400">PRICE TO BEAT</div>
            {marketData.referencePriceStatus && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  marketData.referencePriceStatus.source.startsWith("historical")
                    ? "bg-blue-500/20 text-blue-400"
                    : marketData.referencePriceStatus.found
                    ? "bg-green-500/20 text-green-400"
                    : "bg-yellow-500/20 text-yellow-400"
                }`}
                title={`Source: ${marketData.referencePriceStatus.source}`}
              >
                {marketData.referencePriceStatus.source.startsWith("historical")
                  ? marketData.referencePriceStatus.source.includes("chainlink")
                    ? "📊 Historical (Chainlink)"
                    : "📊 Historical (CoinGecko)"
                  : marketData.referencePriceStatus.found
                  ? "✓ Found"
                  : "⚠ Fallback"}
              </span>
            )}
          </div>
          <div className="text-lg font-bold text-white sm:text-xl">
            {marketData.referencePrice 
              ? `$${marketData.referencePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : marketData.referencePriceStatus && !marketData.referencePriceStatus.found
              ? "Not found in API"
              : "Loading..."}
          </div>
          {marketData.referencePriceStatus && 
           !marketData.referencePriceStatus.found && 
           !marketData.referencePriceStatus.source.startsWith("historical") && (
            <div className="text-[10px] text-yellow-400 mt-1">
              Using fallback value. Check console for details.
            </div>
          )}
          {marketData.referencePriceStatus?.source.startsWith("historical") && (
            <div className="text-[10px] text-blue-400 mt-1">
              Price at market start ({marketData.referencePriceStatus.source.replace("historical_", "")})
            </div>
          )}
        </div>
        <div className="text-left sm:text-right">
          <div className="text-xs text-zinc-400">CURRENT PRICE</div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white sm:text-xl">
              {currentPrice 
                ? `$${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : rtds.connectionStatus === "connecting"
                ? "Connecting..."
                : rtds.connectionStatus === "error"
                ? "Error"
                : "Loading..."}
            </span>
            {priceChangeFormatted && hasPriceChange && (
              <span
                className={`rounded px-2 py-1 text-xs font-semibold ${
                  priceChange! >= 0
                    ? "bg-green-500/20 text-green-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {priceChangeFormatted}
              </span>
            )}
          </div>
          {rtds.connectionStatus === "connected" && currentPrice && (
            <div className="mt-1 text-[10px] text-green-400">
              Live
            </div>
          )}
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
