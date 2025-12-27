"use client";

import { useEffect, useState, useRef } from "react";
import { useRTDS } from "../hooks/useRTDS";

interface PriceDataPoint {
  time: string;
  price: number;
  timestamp: number;
}

export default function PriceChart() {
  const timeRanges = ["Past", "7:30 AM", "7:45 AM", "8 AM", "8:15 AM", "More"];
  const rtds = useRTDS();
  const [priceHistory, setPriceHistory] = useState<PriceDataPoint[]>([]);
  const [referencePrice, setReferencePrice] = useState<number | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; data: PriceDataPoint } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const maxDataPoints = 30; // Keep last 30 data points

  // Fetch reference price
  useEffect(() => {
    const fetchReferencePrice = async () => {
      try {
        const response = await fetch("/api/markets?query=btc&limit=5");
        const data = await response.json();
        if (data.success && data.market?.referencePrice) {
          setReferencePrice(data.market.referencePrice);
        }
      } catch (error) {
        console.error("Failed to fetch reference price:", error);
      }
    };
    fetchReferencePrice();
  }, []);

  // Update price history when new price comes in
  useEffect(() => {
    if (rtds.lastPrice !== null) {
      const now = new Date();
      const timestamp = now.getTime();
      const timeString = now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });

      setPriceHistory((prev) => {
        const newHistory = [
          ...prev,
          { time: timeString, price: rtds.lastPrice!, timestamp },
        ];
        // Keep only the last maxDataPoints
        return newHistory.slice(-maxDataPoints);
      });
    }
  }, [rtds.lastPrice]);

  // Use price history or fallback to sample data
  const dataPoints = priceHistory.length > 0 
    ? priceHistory 
    : [
        { time: "7:26:36 PM", price: 88635, timestamp: Date.now() },
        { time: "7:26:40 PM", price: 88640, timestamp: Date.now() },
        { time: "7:26:46 PM", price: 88638, timestamp: Date.now() },
        { time: "7:26:50 PM", price: 88642, timestamp: Date.now() },
        { time: "7:26:54 PM", price: 88645, timestamp: Date.now() },
        { time: "7:27:00 PM", price: 88637, timestamp: Date.now() },
      ];

  // Calculate price range from actual data points only (exclude reference price from range)
  // This makes small price movements more visible
  const dataPrices = dataPoints.length > 0 ? dataPoints.map((d) => d.price) : [];
  const dataMinPrice = dataPrices.length > 0 ? Math.min(...dataPrices) : 0;
  const dataMaxPrice = dataPrices.length > 0 ? Math.max(...dataPrices) : 0;
  const dataPriceRange = dataMaxPrice - dataMinPrice || 1;
  
  // Add 3% padding above and below to make movements more visible
  const paddingPercent = 0.03; // 3% padding
  const paddingAmount = dataPriceRange * paddingPercent || (dataMinPrice * paddingPercent) || 10;
  
  const minPrice = dataMinPrice - paddingAmount;
  const maxPrice = dataMaxPrice + paddingAmount;
  const priceRange = maxPrice - minPrice || 1; // Avoid division by zero
  
  // Calculate price change
  const firstPrice = dataPoints.length > 0 ? dataPoints[0].price : null;
  const lastPrice = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].price : null;
  const priceChange = firstPrice && lastPrice ? lastPrice - firstPrice : null;
  const priceChangePercent = firstPrice && priceChange ? (priceChange / firstPrice) * 100 : null;
  
  const chartHeight = 200;
  const chartWidth = 1000;
  const padding = { top: 20, right: 60, bottom: 20, left: 20 };
  const chartAreaWidth = chartWidth - padding.left - padding.right;
  const chartAreaHeight = chartHeight - padding.top - padding.bottom;

  // Helper function to convert price to Y coordinate
  const priceToY = (price: number) => {
    return chartHeight - padding.bottom - ((price - minPrice) / priceRange) * chartAreaHeight;
  };

  // Helper function to convert index to X coordinate
  const indexToX = (index: number) => {
    if (dataPoints.length <= 1) return padding.left;
    return padding.left + (index / (dataPoints.length - 1)) * chartAreaWidth;
  };

  // Generate smooth curve path using quadratic bezier curves
  const generateSmoothPath = () => {
    if (dataPoints.length < 2) return "";
    if (dataPoints.length === 2) {
      // Simple line for 2 points
      return `M ${indexToX(0)} ${priceToY(dataPoints[0].price)} L ${indexToX(1)} ${priceToY(dataPoints[1].price)}`;
    }
    
    let path = `M ${indexToX(0)} ${priceToY(dataPoints[0].price)}`;
    
    for (let i = 1; i < dataPoints.length; i++) {
      const x0 = indexToX(i - 1);
      const y0 = priceToY(dataPoints[i - 1].price);
      const x1 = indexToX(i);
      const y1 = priceToY(dataPoints[i].price);
      
      if (i === 1) {
        // First curve: smooth transition from first point
        const x2 = indexToX(i + 1 < dataPoints.length ? i + 1 : i);
        const y2 = priceToY(dataPoints[i + 1 < dataPoints.length ? i + 1 : i].price);
        const cp1x = x0 + (x1 - x0) * 0.5;
        const cp1y = y0 + (y1 - y0) * 0.5;
        path += ` Q ${cp1x} ${cp1y} ${(x1 + x2) / 2} ${(y1 + y2) / 2}`;
      } else if (i === dataPoints.length - 1) {
        // Last segment: draw to final point
        const xPrev = indexToX(i - 2);
        const yPrev = priceToY(dataPoints[i - 2].price);
        const cp1x = x0 + (x1 - xPrev) * 0.3;
        const cp1y = y0 + (y1 - yPrev) * 0.3;
        path += ` Q ${cp1x} ${cp1y} ${x1} ${y1}`;
      } else {
        // Middle segments: smooth curves
        const x2 = indexToX(i + 1);
        const y2 = priceToY(dataPoints[i + 1].price);
        const cp1x = x0 + (x1 - (i > 1 ? indexToX(i - 2) : x0)) * 0.3;
        const cp1y = y0 + (y1 - (i > 1 ? priceToY(dataPoints[i - 2].price) : y0)) * 0.3;
        path += ` Q ${cp1x} ${cp1y} ${(x1 + x2) / 2} ${(y1 + y2) / 2}`;
      }
    }
    
    return path;
  };

  // Generate area path for gradient fill
  const generateAreaPath = () => {
    if (dataPoints.length < 2) return "";
    const linePath = generateSmoothPath();
    const lastX = indexToX(dataPoints.length - 1);
    const firstX = indexToX(0);
    const baseY = chartHeight - padding.bottom;
    return `${linePath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  };

  // Handle mouse move for tooltip
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || dataPoints.length === 0) return;
    
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const svgX = (x / rect.width) * chartWidth;
    
    // Find closest data point
    let closestIndex = 0;
    let minDistance = Math.abs(svgX - indexToX(0));
    
    for (let i = 1; i < dataPoints.length; i++) {
      const distance = Math.abs(svgX - indexToX(i));
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }
    
    const point = dataPoints[closestIndex];
    const pointX = indexToX(closestIndex);
    const pointY = priceToY(point.price);
    
    setHoveredPoint({
      x: pointX,
      y: pointY,
      data: point,
    });
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };

  return (
    <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Price Chart</h3>
          {priceChange !== null && priceChangePercent !== null && (
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span className="text-zinc-400">
                {priceChange >= 0 ? "+" : ""}${priceChange.toFixed(2)}
              </span>
              <span
                className={`font-semibold ${
                  priceChange >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                ({priceChange >= 0 ? "+" : ""}
                {priceChangePercent.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>
        <button className="rounded bg-zinc-800 px-3 py-1 text-sm text-white hover:bg-zinc-700">
          Target
        </button>
      </div>

      {/* Chart Container */}
      <div className="relative mb-4 w-full" style={{ height: `${chartHeight}px` }}>
        <svg
          ref={svgRef}
          width="100%"
          height={chartHeight}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: "block", cursor: "crosshair" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Grid lines */}
          {dataPoints.length > 0 && (
            <>
              {/* Horizontal grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = padding.top + ratio * chartAreaHeight;
                const price = maxPrice - ratio * priceRange;
                return (
                  <g key={`grid-${ratio}`}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={chartWidth - padding.right}
                      y2={y}
                      stroke="#27272a"
                      strokeWidth="1"
                      strokeDasharray="2,2"
                    />
                    <text
                      x={chartWidth - padding.right + 10}
                      y={y + 4}
                      fill="#71717a"
                      fontSize="11"
                      textAnchor="start"
                    >
                      ${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </text>
                  </g>
                );
              })}
            </>
          )}

          {/* Reference price line (price to beat) - show even if slightly outside visible range */}
          {referencePrice !== null && (
            <g>
              {/* Only draw line if it's within reasonable bounds (even if slightly outside visible range) */}
              {(() => {
                const refY = priceToY(referencePrice);
                return refY >= -50 && refY <= chartHeight + 50 && (
                  <line
                    x1={padding.left}
                    y1={refY}
                    x2={chartWidth - padding.right}
                    y2={refY}
                    stroke="#71717a"
                    strokeWidth="1.5"
                    strokeDasharray="4,4"
                    opacity="0.6"
                  />
                );
              })()}
              {/* Show label if reference price is close to visible range */}
              {(() => {
                const refY = priceToY(referencePrice);
                return refY >= -100 && refY <= chartHeight + 100 && (
                  <text
                    x={padding.left + 5}
                    y={Math.max(padding.top + 5, Math.min(chartHeight - padding.bottom - 5, refY - 5))}
                    fill="#71717a"
                    fontSize="10"
                    fontWeight="500"
                  >
                    Target: ${referencePrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </text>
                );
              })()}
            </g>
          )}

          {/* Gradient area fill */}
          {dataPoints.length > 1 && (
            <defs>
              <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#f97316" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#f97316" stopOpacity="0.05" />
              </linearGradient>
            </defs>
          )}
          {dataPoints.length > 1 && (
            <path
              d={generateAreaPath()}
              fill="url(#chartGradient)"
            />
          )}

          {/* Chart line (smooth curve) */}
          {dataPoints.length > 1 && (
            <path
              d={generateSmoothPath()}
              fill="none"
              stroke={priceChange !== null && priceChange >= 0 ? "#22c55e" : "#ef4444"}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Data points */}
          {dataPoints.map((point, i) => {
            const x = indexToX(i);
            const y = priceToY(point.price);
            const isLast = i === dataPoints.length - 1;
            
            return (
              <g key={i}>
                {/* Regular point */}
                {!isLast && (
                  <circle
                    cx={x}
                    cy={y}
                    r="3"
                    fill={priceChange !== null && priceChange >= 0 ? "#22c55e" : "#ef4444"}
                    opacity="0.6"
                  />
                )}
                {/* Current/last point with pulse animation */}
                {isLast && (
                  <g>
                    <circle
                      cx={x}
                      cy={y}
                      r="6"
                      fill={priceChange !== null && priceChange >= 0 ? "#22c55e" : "#ef4444"}
                      opacity="0.3"
                      className="animate-ping"
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r="5"
                      fill={priceChange !== null && priceChange >= 0 ? "#22c55e" : "#ef4444"}
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r="2"
                      fill="white"
                    />
                  </g>
                )}
              </g>
            );
          })}

          {/* Hover tooltip */}
          {hoveredPoint && (
            <g>
              {/* Vertical line at hovered point */}
              <line
                x1={hoveredPoint.x}
                y1={padding.top}
                x2={hoveredPoint.x}
                y2={chartHeight - padding.bottom}
                stroke="#71717a"
                strokeWidth="1"
                strokeDasharray="2,2"
                opacity="0.5"
              />
              {/* Tooltip background */}
              <rect
                x={hoveredPoint.x - 60}
                y={hoveredPoint.y - 50}
                width="120"
                height="40"
                fill="#18181b"
                stroke="#3f3f46"
                strokeWidth="1"
                rx="4"
              />
              {/* Tooltip text */}
              <text
                x={hoveredPoint.x}
                y={hoveredPoint.y - 30}
                fill="#ffffff"
                fontSize="11"
                fontWeight="600"
                textAnchor="middle"
              >
                ${hoveredPoint.data.price.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </text>
              <text
                x={hoveredPoint.x}
                y={hoveredPoint.y - 15}
                fill="#a1a1aa"
                fontSize="10"
                textAnchor="middle"
              >
                {hoveredPoint.data.time}
              </text>
              {/* Hovered point highlight */}
              <circle
                cx={hoveredPoint.x}
                cy={hoveredPoint.y}
                r="6"
                fill="none"
                stroke="#71717a"
                strokeWidth="2"
                opacity="0.8"
              />
              <circle
                cx={hoveredPoint.x}
                cy={hoveredPoint.y}
                r="4"
                fill={priceChange !== null && priceChange >= 0 ? "#22c55e" : "#ef4444"}
              />
            </g>
          )}
          
          {/* Show connection status */}
          {rtds.connectionStatus === "connecting" && (
            <text
              x={chartWidth / 2}
              y={chartHeight / 2}
              fill="#71717a"
              fontSize="14"
              textAnchor="middle"
            >
              Connecting...
            </text>
          )}
          {rtds.connectionStatus === "error" && (
            <text
              x={chartWidth / 2}
              y={chartHeight / 2}
              fill="#ef4444"
              fontSize="14"
              textAnchor="middle"
            >
              Connection Error
            </text>
          )}
          {rtds.connectionStatus === "connected" && priceHistory.length === 0 && (
            <text
              x={chartWidth / 2}
              y={chartHeight / 2}
              fill="#71717a"
              fontSize="14"
              textAnchor="middle"
            >
              Waiting for price data...
            </text>
          )}
        </svg>
      </div>

      {/* X-axis time labels */}
      <div className="flex justify-between text-xs text-zinc-400">
        {dataPoints.length > 0 ? (
          dataPoints.map((point, i) => {
            // Show every nth label to avoid crowding
            const showLabel = dataPoints.length <= 6 || i % Math.ceil(dataPoints.length / 6) === 0 || i === dataPoints.length - 1;
            return showLabel ? (
              <span key={i}>{point.time}</span>
            ) : (
              <span key={i}></span>
            );
          })
        ) : (
          <span>No data</span>
        )}
      </div>
      
      {/* Live indicator */}
      {rtds.connectionStatus === "connected" && priceHistory.length > 0 && (
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-green-400">
          <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
          <span>Live</span>
        </div>
      )}

      {/* Time Range Selector */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-4">
        {timeRanges.map((range, i) => (
          <button
            key={i}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
              i === 0
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            {range}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-red-500"></div>
          <div className="h-2 w-2 rounded-full bg-green-500"></div>
        </div>
      </div>
    </div>
  );
}

