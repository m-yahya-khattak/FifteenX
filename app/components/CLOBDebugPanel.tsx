"use client";

import { useState, useEffect } from "react";
import CLOBDebug from "./CLOBDebug";

export default function CLOBDebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
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
    const interval = setInterval(fetchAssetIds, 120000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {/* Toggle Button - Fixed position */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed left-0 top-1/2 z-50 -translate-y-1/2 rounded-r-lg border border-zinc-700 border-l-0 bg-zinc-900 px-2 py-4 text-xs font-medium text-zinc-400 transition-all hover:bg-zinc-800 hover:text-white"
        title={isOpen ? "Hide Debug Panel" : "Show Debug Panel"}
      >
        <div className="flex flex-col items-center gap-1">
          <svg
            className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          <span className="text-[10px]">DEBUG</span>
        </div>
      </button>

      {/* Slide-in Panel */}
      <div
        className={`fixed left-0 top-0 z-40 h-full w-80 transform border-r border-zinc-800 bg-zinc-900 shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 p-4">
            <h2 className="text-sm font-semibold text-white">CLOB Debug Panel</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto p-4">
            {assetIds && assetIds.length > 0 ? (
              <CLOBDebug assetIds={assetIds} />
            ) : (
              <div className="text-center text-sm text-zinc-500">Loading asset IDs...</div>
            )}
          </div>
        </div>
      </div>

      {/* Overlay when open */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

