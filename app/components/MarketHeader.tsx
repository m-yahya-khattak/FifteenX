export default function MarketHeader() {
  return (
    <div className="mb-6">
      {/* Market Title */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white sm:h-8 sm:w-8 sm:text-sm">
          B
        </div>
        <div>
          <h1 className="text-xl font-bold text-white sm:text-2xl">Bitcoin Up or Down</h1>
          <p className="text-xs text-zinc-400 sm:text-sm">December 26, 7:15-7:30AM ET</p>
        </div>
      </div>

      {/* Price Info */}
      <div className="mb-4 flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs text-zinc-400">PRICE TO BEAT</div>
          <div className="text-lg font-bold text-white sm:text-xl">$88,630.18</div>
        </div>
        <div className="text-left sm:text-right">
          <div className="text-xs text-zinc-400">CURRENT PRICE</div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white sm:text-xl">$88,637.72</span>
            <span className="rounded bg-green-500/20 px-2 py-1 text-xs font-semibold text-green-400">
              +$8
            </span>
          </div>
        </div>
      </div>

      {/* Countdown Timer */}
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
        <span className="text-base font-bold sm:text-lg">02 MINS 52 SECS</span>
      </div>
    </div>
  );
}

