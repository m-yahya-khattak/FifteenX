"use client";

import { useState, useEffect } from "react";
import CLOBDebug from "./CLOBDebug";

export default function CLOBDebugWrapper() {
  const [assetIds, setAssetIds] = useState<string[] | null>(null);

  useEffect(() => {
    const fetchAssetIds = async () => {
      try {
        const response = await fetch("/api/markets?query=btc&limit=5");
        const data = await response.json();
        if (data.success && data.market?.assetIds) {
          setAssetIds(data.market.assetIds);
        }
      } catch (error) {
        console.error("Failed to fetch asset IDs for debug:", error);
      }
    };

    fetchAssetIds();
    
    // Refresh every 2 minutes to get new market asset IDs
    const interval = setInterval(fetchAssetIds, 120000);
    return () => clearInterval(interval);
  }, []);

  if (!assetIds || assetIds.length === 0) {
    return (
      <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-xs">
        <div className="text-zinc-400">Loading asset IDs...</div>
      </div>
    );
  }

  return <CLOBDebug assetIds={assetIds} />;
}

