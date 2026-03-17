"use client";

import { useEffect, useRef } from "react";
import { isMainAppPaused } from "../lib/appConfig";

/**
 * Hook to manage server-side historical data capture
 * This starts/stops the server WebSocket that captures data directly to DB
 */
export function useHistoricalCapture(assetIds: string[] | null, enabled: boolean = true) {
  const isCapturingRef = useRef(false);

  useEffect(() => {
    // Don't capture if main app is paused
    if (isMainAppPaused() || !assetIds || assetIds.length === 0 || !enabled) {
      // Stop capture if no asset IDs or disabled
      if (isCapturingRef.current) {
        fetch("/api/websocket/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stop", assetIds }),
        }).catch(() => {});
        isCapturingRef.current = false;
      }
      return;
    }

    // Start capture
    if (!isCapturingRef.current) {
      fetch("/api/websocket/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", assetIds }),
      })
        .then(() => {
          isCapturingRef.current = true;
        })
        .catch((err) => {
          console.error("Failed to start historical capture:", err);
        });
    }

    // Cleanup: stop capture on unmount or when assetIds change
    return () => {
      if (isCapturingRef.current) {
        fetch("/api/websocket/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stop", assetIds }),
        }).catch(() => {});
        isCapturingRef.current = false;
      }
    };
  }, [assetIds?.join(","), enabled]);
}

