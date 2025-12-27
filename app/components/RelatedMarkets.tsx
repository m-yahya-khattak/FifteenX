const markets = [
  { name: "Ethereum Up or Down", percentage: 67, direction: "Up", logo: "E" },
  { name: "Solana Up or Down", percentage: 66, direction: "Up", logo: "S" },
  { name: "XRP Up or Down", percentage: 89, direction: "Up", logo: "X" },
];

export default function RelatedMarkets() {
  return (
    <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="mb-4 text-lg font-semibold text-white">Related Markets</h3>
      <div className="space-y-3">
        {markets.map((market, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-800 p-3 hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500 text-sm font-bold text-white">
              {market.logo}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-white">
                {market.name}
              </div>
              <div className="text-xs text-zinc-400">
                {market.percentage}% {market.direction}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}



