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

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-zinc-800 scrollbar-hide">
          {[
            "Trending",
            "Breaking",
            "New",
            "Politics",
            "Sports",
            "Crypto",
            "Finance",
            "Geopolitics",
            "Earnings",
            "Tech",
            "Culture",
            "World",
          ].map((tab) => (
            <button
              key={tab}
              className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white sm:px-4 sm:py-3 sm:text-sm"
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

