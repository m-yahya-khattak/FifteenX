export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-black">
      <div className="mx-auto max-w-7xl px-4">
        {/* Top Bar */}
        <div className="flex items-center justify-between py-3">
          {/* Left: Logo and Search */}
          <div className="flex items-center gap-6">
            <div className="text-xl font-bold text-white">FifteenX</div>
            <div className="relative hidden md:block">
              <input
                type="text"
                placeholder="Search polymarket"
                className="w-64 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-white placeholder-zinc-500 focus:border-zinc-700 focus:outline-none"
              />
            </div>
          </div>

          {/* Right: Portfolio and User Actions */}
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden items-center gap-2 text-xs text-white sm:flex sm:gap-4 sm:text-sm">
              <div>
                <span className="text-zinc-400">Portfolio</span>{" "}
                <span className="font-semibold">$0.00</span>
              </div>
              <div>
                <span className="text-zinc-400">Cash</span>{" "}
                <span className="font-semibold">$0.00</span>
              </div>
            </div>
            <button className="rounded-lg bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700 sm:px-4 sm:py-2 sm:text-sm">
              <span className="hidden sm:inline">Deposit</span>
              <span className="sm:hidden">Dep</span>
            </button>
            <button className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900">
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </button>
            <button className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900">
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Time Range Selector */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-zinc-800 bg-zinc-950/50 scrollbar-hide">
          <div className="flex items-center gap-1 px-2">
            <svg
              className="h-4 w-4 text-zinc-500"
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
            <span className="text-xs font-medium text-zinc-500">Time Range:</span>
          </div>
          {["Past", "7:30 AM", "7:45 AM", "8 AM", "8:15 AM", "More"].map((range, i) => (
            <button
              key={range}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-all sm:px-4 sm:py-2.5 sm:text-sm ${
                i === 0
                  ? "border-orange-500 text-white"
                  : "border-transparent text-zinc-400 hover:border-zinc-600 hover:text-white"
              }`}
            >
              {range}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 px-3">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-red-500"></div>
              <span className="text-[10px] text-zinc-500 sm:text-xs">Down</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-green-500"></div>
              <span className="text-[10px] text-zinc-500 sm:text-xs">Up</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

