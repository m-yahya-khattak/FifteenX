export default function MarketHeader() {
  return (
    <div className="mb-6">
      {/* Market Title */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white">
          B
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Bitcoin Up or Down</h1>
          <p className="text-sm text-zinc-400">December 26, 7:15-7:30AM ET</p>
        </div>
      </div>

      {/* Price Info */}
      <div className="mb-4 flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <div>
          <div className="text-xs text-zinc-400">PRICE TO BEAT</div>
          <div className="text-xl font-bold text-white">$88,630.18</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-zinc-400">CURRENT PRICE</div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-white">$88,637.72</span>
            <span className="rounded bg-green-500/20 px-2 py-1 text-xs font-semibold text-green-400">
              +$8
            </span>
          </div>
        </div>
      </div>

      {/* Countdown Timer */}
      <div className="flex items-center gap-2 text-red-500">
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
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="text-lg font-bold">02 MINS 52 SECS</span>
      </div>
    </div>
  );
}

