"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRTDS } from "../hooks/useRTDS";

interface PriceDataPoint {
  time: string;
  price: number;
  timestamp: number;
}

export default function PriceChart() {
  const rtds = useRTDS();
  const [priceHistory, setPriceHistory] = useState<PriceDataPoint[]>([]);
  const [referencePrice, setReferencePrice] = useState<number | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; data: PriceDataPoint } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const pendingUpdateRef = useRef<PriceDataPoint | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const maxDataPoints = 30; // Keep last 30 data points
  const updateThrottleMs = 250; // Update every 250ms for more frequent updates
  const animatedPriceRef = useRef<number | null>(null); // Use ref instead of state to avoid re-renders
  const [animatedLastPoint, setAnimatedLastPoint] = useState<{ price: number; time: string; timestamp: number } | null>(null);
  const animationRef = useRef<number | null>(null);
  const animationStartRef = useRef<{ startPrice: number; targetPrice: number; startTime: number } | null>(null);
  const currentTargetPriceRef = useRef<number | null>(null);
  const lastUpdateTimeRef2 = useRef<number>(0); // Track when to update state (throttled)

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

  // Continuous animation loop - always running, never stops
  useEffect(() => {
    const animate = () => {
      const now = Date.now();
      const animationDuration = 500; // Slower, smoother animation

      // Get current price (either from animated point or last history point)
      let currentPrice = animatedPriceRef.current;
      if (currentPrice === null && priceHistory.length > 0) {
        currentPrice = priceHistory[priceHistory.length - 1].price;
        animatedPriceRef.current = currentPrice;
      }

      // Always check for new target and update animation
      if (currentTargetPriceRef.current !== null && currentPrice !== null) {
        const targetPrice = currentTargetPriceRef.current;
        const priceDiff = Math.abs(targetPrice - currentPrice);

        if (priceDiff > 0.01) {
          // Need to animate to new target
          if (!animationStartRef.current) {
            // Start new animation
            animationStartRef.current = {
              startPrice: currentPrice,
              targetPrice: targetPrice,
              startTime: now,
            };
          } else {
            // Update existing animation if target changed significantly
            const currentTarget = animationStartRef.current.targetPrice;
            if (Math.abs(targetPrice - currentTarget) > 0.01) {
              // Target changed - smoothly transition to new target
              const elapsed = now - animationStartRef.current.startTime;
              const progress = Math.min(elapsed / animationDuration, 1);
              const eased = 1 - Math.pow(1 - progress, 3);
              const currentAnimatedPrice =
                animationStartRef.current.startPrice +
                (currentTarget - animationStartRef.current.startPrice) * eased;

              // Continue from current position to new target
              animationStartRef.current = {
                startPrice: currentAnimatedPrice,
                targetPrice: targetPrice,
                startTime: now,
              };
            }
          }
        }
      }

      // Animate if we have an active animation
      if (animationStartRef.current) {
        const elapsed = now - animationStartRef.current.startTime;
        const progress = Math.min(elapsed / animationDuration, 1);

        if (progress < 1) {
          // Ease-out function for smooth deceleration
          const eased = 1 - Math.pow(1 - progress, 3);
          const animatedPrice =
            animationStartRef.current.startPrice +
            (animationStartRef.current.targetPrice - animationStartRef.current.startPrice) * eased;

          animatedPriceRef.current = animatedPrice;

          // Throttle state updates to avoid too many re-renders (update every 33ms = ~30fps for smooth but not excessive)
          if (now - lastUpdateTimeRef2.current >= 33) {
            if (priceHistory.length > 0) {
              const lastPoint = priceHistory[priceHistory.length - 1];
              setAnimatedLastPoint({
                price: animatedPrice,
                time: lastPoint.time,
                timestamp: lastPoint.timestamp,
              });
            }
            lastUpdateTimeRef2.current = now;
          }
        } else {
          // Animation reached target - update ref but keep animating if target changed
          animatedPriceRef.current = animationStartRef.current.targetPrice;
          
          // Update state
          if (priceHistory.length > 0) {
            const lastPoint = priceHistory[priceHistory.length - 1];
            setAnimatedLastPoint({
              price: animationStartRef.current.targetPrice,
              time: lastPoint.time,
              timestamp: lastPoint.timestamp,
            });
          }

          // Check if target changed - if so, continue animating
          if (currentTargetPriceRef.current !== null &&
              Math.abs(currentTargetPriceRef.current - animationStartRef.current.targetPrice) > 0.01) {
            animationStartRef.current = {
              startPrice: animationStartRef.current.targetPrice,
              targetPrice: currentTargetPriceRef.current,
              startTime: now,
            };
          } else {
            // No new target, but keep animation ref ready
            animationStartRef.current = null;
          }
        }
      }

      // Always continue animation loop
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [priceHistory]);

  // Update target price immediately for continuous animation (no throttle)
  useEffect(() => {
    if (rtds.lastPrice !== null) {
      currentTargetPriceRef.current = rtds.lastPrice;
      
      // Initialize animated price if not set
      if (animatedPriceRef.current === null && priceHistory.length > 0) {
        animatedPriceRef.current = priceHistory[priceHistory.length - 1].price;
      } else if (animatedPriceRef.current === null) {
        animatedPriceRef.current = rtds.lastPrice;
      }
    }
  }, [rtds.lastPrice, priceHistory]);

  // Throttled update function - adds data points but animation runs continuously
  const updatePriceHistory = useCallback(() => {
    if (pendingUpdateRef.current) {
      const update = pendingUpdateRef.current;
      
      // Always add to history (animation handles the smooth transition)
      setPriceHistory((prev) => {
        // If we have animated point, replace last point, otherwise append
        if (animatedLastPoint && prev.length > 0) {
          const newHistory = [
            ...prev.slice(0, -1),
            {
              price: update.price,
              time: update.time,
              timestamp: update.timestamp,
            },
          ];
          return newHistory.slice(-maxDataPoints);
        } else {
          const newHistory = [
            ...prev,
            update,
          ];
          return newHistory.slice(-maxDataPoints);
        }
      });
      
      pendingUpdateRef.current = null;
      lastUpdateTimeRef.current = Date.now();
    }
    animationFrameRef.current = null;
  }, [animatedLastPoint]);

  // Update price history when new price comes in (throttled for data points, but animation is immediate)
  useEffect(() => {
    if (rtds.lastPrice !== null) {
      const now = Date.now();
      const timeString = new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });

      // Store pending update for data point addition (throttled)
      pendingUpdateRef.current = {
        time: timeString,
        price: rtds.lastPrice,
        timestamp: now,
      };

      // Update target price immediately for continuous animation (no throttle)
      currentTargetPriceRef.current = rtds.lastPrice;

      // Throttle data point additions: only add to history if enough time has passed
      const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
      if (timeSinceLastUpdate >= updateThrottleMs) {
        // Update immediately if enough time has passed
        updatePriceHistory();
      } else if (!animationFrameRef.current) {
        // Schedule update for next animation frame if not already scheduled
        animationFrameRef.current = requestAnimationFrame(() => {
          const timeSinceLastUpdate = Date.now() - lastUpdateTimeRef.current;
          if (timeSinceLastUpdate >= updateThrottleMs) {
            updatePriceHistory();
          } else {
            // Wait a bit more
            setTimeout(updatePriceHistory, updateThrottleMs - timeSinceLastUpdate);
          }
        });
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [rtds.lastPrice, updatePriceHistory]);

  // Use price history or fallback to sample data
  const baseDataPoints = priceHistory.length > 0 
    ? priceHistory 
    : [
        { time: "7:26:36 PM", price: 88635, timestamp: Date.now() },
        { time: "7:26:40 PM", price: 88640, timestamp: Date.now() },
        { time: "7:26:46 PM", price: 88638, timestamp: Date.now() },
        { time: "7:26:50 PM", price: 88642, timestamp: Date.now() },
        { time: "7:26:54 PM", price: 88645, timestamp: Date.now() },
        { time: "7:27:00 PM", price: 88637, timestamp: Date.now() },
      ];

  // Replace last point with animated version if animation is active
  const dataPoints = useMemo(() => {
    if (animatedLastPoint && baseDataPoints.length > 0) {
      return [
        ...baseDataPoints.slice(0, -1),
        animatedLastPoint,
      ];
    }
    return baseDataPoints;
  }, [baseDataPoints, animatedLastPoint]);

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

  // Memoize helper functions and calculations
  const priceToY = useCallback((price: number, min: number, max: number, range: number) => {
    return chartHeight - padding.bottom - ((price - min) / range) * chartAreaHeight;
  }, [chartHeight, padding, chartAreaHeight]);

  const indexToX = useCallback((index: number, total: number) => {
    if (total <= 1) return padding.left;
    return padding.left + (index / (total - 1)) * chartAreaWidth;
  }, [padding, chartAreaWidth]);

  // Memoize smooth path generation
  const smoothPath = useMemo(() => {
    if (dataPoints.length < 2) return "";
    if (dataPoints.length === 2) {
      return `M ${indexToX(0, dataPoints.length)} ${priceToY(dataPoints[0].price, minPrice, maxPrice, priceRange)} L ${indexToX(1, dataPoints.length)} ${priceToY(dataPoints[1].price, minPrice, maxPrice, priceRange)}`;
    }
    
    let path = `M ${indexToX(0, dataPoints.length)} ${priceToY(dataPoints[0].price, minPrice, maxPrice, priceRange)}`;
    
    for (let i = 1; i < dataPoints.length; i++) {
      const x0 = indexToX(i - 1, dataPoints.length);
      const y0 = priceToY(dataPoints[i - 1].price, minPrice, maxPrice, priceRange);
      const x1 = indexToX(i, dataPoints.length);
      const y1 = priceToY(dataPoints[i].price, minPrice, maxPrice, priceRange);
      
      if (i === 1) {
        const x2 = indexToX(i + 1 < dataPoints.length ? i + 1 : i, dataPoints.length);
        const y2 = priceToY(dataPoints[i + 1 < dataPoints.length ? i + 1 : i].price, minPrice, maxPrice, priceRange);
        const cp1x = x0 + (x1 - x0) * 0.5;
        const cp1y = y0 + (y1 - y0) * 0.5;
        path += ` Q ${cp1x} ${cp1y} ${(x1 + x2) / 2} ${(y1 + y2) / 2}`;
      } else if (i === dataPoints.length - 1) {
        const xPrev = indexToX(i - 2, dataPoints.length);
        const yPrev = priceToY(dataPoints[i - 2].price, minPrice, maxPrice, priceRange);
        const cp1x = x0 + (x1 - xPrev) * 0.3;
        const cp1y = y0 + (y1 - yPrev) * 0.3;
        path += ` Q ${cp1x} ${cp1y} ${x1} ${y1}`;
      } else {
        const x2 = indexToX(i + 1, dataPoints.length);
        const y2 = priceToY(dataPoints[i + 1].price, minPrice, maxPrice, priceRange);
        const cp1x = x0 + (x1 - (i > 1 ? indexToX(i - 2, dataPoints.length) : x0)) * 0.3;
        const cp1y = y0 + (y1 - (i > 1 ? priceToY(dataPoints[i - 2].price, minPrice, maxPrice, priceRange) : y0)) * 0.3;
        path += ` Q ${cp1x} ${cp1y} ${(x1 + x2) / 2} ${(y1 + y2) / 2}`;
      }
    }
    
    return path;
  }, [dataPoints, minPrice, maxPrice, priceRange, indexToX, priceToY]);

  // Memoize area path
  const areaPath = useMemo(() => {
    if (dataPoints.length < 2) return "";
    const linePath = smoothPath;
    const lastX = indexToX(dataPoints.length - 1, dataPoints.length);
    const firstX = indexToX(0, dataPoints.length);
    const baseY = chartHeight - padding.bottom;
    return `${linePath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  }, [smoothPath, dataPoints.length, indexToX, chartHeight, padding]);

  // Handle mouse move for tooltip (throttled for performance)
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || dataPoints.length === 0) return;
    
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const svgX = (x / rect.width) * chartWidth;
    
    // Find closest data point
    let closestIndex = 0;
    let minDistance = Math.abs(svgX - indexToX(0, dataPoints.length));
    
    for (let i = 1; i < dataPoints.length; i++) {
      const distance = Math.abs(svgX - indexToX(i, dataPoints.length));
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }
    
    const point = dataPoints[closestIndex];
    const pointX = indexToX(closestIndex, dataPoints.length);
    const pointY = priceToY(point.price, minPrice, maxPrice, priceRange);
    
    setHoveredPoint({
      x: pointX,
      y: pointY,
      data: point,
    });
  }, [dataPoints, minPrice, maxPrice, priceRange, indexToX, priceToY]);

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
                const refY = priceToY(referencePrice, minPrice, maxPrice, priceRange);
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
                const refY = priceToY(referencePrice, minPrice, maxPrice, priceRange);
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
                <stop offset="0%" stopColor={priceChange !== null && priceChange >= 0 ? "#22c55e" : "#ef4444"} stopOpacity="0.3" />
                <stop offset="100%" stopColor={priceChange !== null && priceChange >= 0 ? "#22c55e" : "#ef4444"} stopOpacity="0.05" />
              </linearGradient>
            </defs>
          )}
          {dataPoints.length > 1 && (
            <path
              d={areaPath}
              fill="url(#chartGradient)"
              style={{ transition: "d 0.3s ease-out" }}
            />
          )}

          {/* Chart line (smooth curve) */}
          {dataPoints.length > 1 && (
            <path
              d={smoothPath}
              fill="none"
              stroke={priceChange !== null && priceChange >= 0 ? "#22c55e" : "#ef4444"}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transition: "d 0.3s ease-out" }}
            />
          )}

          {/* Data points */}
          {dataPoints.map((point, i) => {
            const x = indexToX(i, dataPoints.length);
            const y = priceToY(point.price, minPrice, maxPrice, priceRange);
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

    </div>
  );
}

