export default function PriceChart() {
  const timeRanges = ["Past", "7:30 AM", "7:45 AM", "8 AM", "8:15 AM", "More"];

  // Sample data points for the chart
  const dataPoints = [
    { time: "7:26:36 PM", price: 88635 },
    { time: "7:26:40 PM", price: 88640 },
    { time: "7:26:46 PM", price: 88638 },
    { time: "7:26:50 PM", price: 88642 },
    { time: "7:26:54 PM", price: 88645 },
    { time: "7:27:00 PM", price: 88637 },
  ];

  const minPrice = Math.min(...dataPoints.map((d) => d.price));
  const maxPrice = Math.max(...dataPoints.map((d) => d.price));
  const priceRange = maxPrice - minPrice;
  const chartHeight = 200;
  // Use a reasonable width that scales well on all screen sizes
  const chartWidth = 1000;

  return (
    <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Price Chart</h3>
        <button className="rounded bg-zinc-800 px-3 py-1 text-sm text-white hover:bg-zinc-700">
          Target
        </button>
      </div>

      {/* Chart Container */}
      <div className="relative mb-4 w-full" style={{ height: `${chartHeight}px` }}>
        <svg
          width="100%"
          height={chartHeight}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: "block" }}
        >
          {/* Y-axis labels */}
          <text
            x={chartWidth - 20}
            y={20}
            fill="#71717a"
            fontSize="12"
            textAnchor="end"
          >
            $88,645
          </text>
          <text
            x={chartWidth - 20}
            y={chartHeight / 2}
            fill="#71717a"
            fontSize="12"
            textAnchor="end"
          >
            $88,640
          </text>
          <text
            x={chartWidth - 20}
            y={chartHeight - 10}
            fill="#71717a"
            fontSize="12"
            textAnchor="end"
          >
            $88,635
          </text>

          {/* Price difference labels on left */}
          <text x={10} y={20} fill="#22c55e" fontSize="12" fontWeight="bold">
            +$36
          </text>
          <text x={10} y={60} fill="#22c55e" fontSize="12" fontWeight="bold">
            +$13
          </text>
          <text x={10} y={100} fill="#22c55e" fontSize="12" fontWeight="bold">
            +$3
          </text>
          <text x={10} y={140} fill="#22c55e" fontSize="12" fontWeight="bold">
            +$2
          </text>
          <text x={10} y={180} fill="#22c55e" fontSize="12" fontWeight="bold">
            +$11
          </text>

          {/* Chart line */}
          <polyline
            points={dataPoints
              .map(
                (d, i) =>
                  `${(i / (dataPoints.length - 1)) * (chartWidth - 100) + 50},${
                    chartHeight -
                    ((d.price - minPrice) / priceRange) * (chartHeight - 40) -
                    20
                  }`
              )
              .join(" ")}
            fill="none"
            stroke="#f97316"
            strokeWidth="2"
          />
        </svg>
      </div>

      {/* X-axis time labels */}
      <div className="flex justify-between text-xs text-zinc-400">
        {dataPoints.map((point, i) => (
          <span key={i}>{point.time}</span>
        ))}
      </div>

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

