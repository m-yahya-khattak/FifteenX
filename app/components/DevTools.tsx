"use client";

import { useState, useEffect } from "react";
import { useRTDS } from "../hooks/useRTDS";

interface ConnectionStatus {
  name: string;
  status: "connected" | "disconnected" | "connecting" | "error";
  lastCheck?: Date;
  lastPrice?: number;
}

export default function DevTools() {
  const [isOpen, setIsOpen] = useState(false);
  const rtds = useRTDS();
  
  const [connections, setConnections] = useState<ConnectionStatus[]>([
    { name: "Gamma API", status: "disconnected" },
    { name: "CLOB API", status: "disconnected" },
    { name: "RTDS", status: "disconnected" },
    { name: "Price Feed", status: "disconnected" },
  ]);

  // Check API connections
  const checkConnections = async () => {
    // Set all to connecting
    setConnections((prev) =>
      prev.map((conn) => ({
        ...conn,
        status: "connecting" as const,
      }))
    );

    // Check Gamma API
    try {
      const response = await fetch("/api/markets?query=btc&limit=1");
      const data = await response.json();

      setConnections((prev) =>
        prev.map((conn) => {
          if (conn.name === "Gamma API") {
            return {
              ...conn,
              status: data.success ? "connected" : "error",
              lastCheck: new Date(),
            };
          }
          return conn;
        })
      );
    } catch (error) {
      setConnections((prev) =>
        prev.map((conn) => {
          if (conn.name === "Gamma API") {
            return {
              ...conn,
              status: "error",
              lastCheck: new Date(),
            };
          }
          return conn;
        })
      );
    }

    // Check CLOB API
    try {
      const clobResponse = await fetch("https://clob.polymarket.com/markets?limit=1", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
      });

      setConnections((prev) =>
        prev.map((conn) => {
          if (conn.name === "CLOB API") {
            return {
              ...conn,
              status: clobResponse.ok ? "connected" : "error",
              lastCheck: new Date(),
            };
          }
          return conn;
        })
      );
    } catch (error) {
      setConnections((prev) =>
        prev.map((conn) => {
          if (conn.name === "CLOB API") {
            return {
              ...conn,
              status: "error",
              lastCheck: new Date(),
            };
          }
          return conn;
        })
      );
    }

    // Update RTDS status from hook
    setConnections((prev) =>
      prev.map((conn) => {
        if (conn.name === "RTDS") {
          return {
            ...conn,
            status: rtds.connectionStatus,
            lastCheck: new Date(),
            lastPrice: rtds.lastPrice || undefined,
          };
        }
        if (conn.name === "Price Feed") {
          return {
            ...conn,
            status: rtds.isConnected && rtds.lastPrice ? "connected" : "disconnected",
            lastCheck: new Date(),
          };
        }
        return conn;
      })
    );
  };

  // Update RTDS status in real-time
  useEffect(() => {
    setConnections((prev) =>
      prev.map((conn) => {
        if (conn.name === "RTDS") {
          return {
            ...conn,
            status: rtds.connectionStatus,
            lastPrice: rtds.lastPrice || undefined,
          };
        }
        if (conn.name === "Price Feed") {
          return {
            ...conn,
            status: rtds.isConnected && rtds.lastPrice ? "connected" : "disconnected",
          };
        }
        return conn;
      })
    );
  }, [rtds.connectionStatus, rtds.isConnected, rtds.lastPrice]);

  const getStatusColor = (status: ConnectionStatus["status"]) => {
    switch (status) {
      case "connected":
        return "bg-green-500";
      case "connecting":
        return "bg-yellow-500";
      case "error":
        return "bg-red-500";
      default:
        return "bg-zinc-500";
    }
  };

  const getStatusText = (status: ConnectionStatus["status"]) => {
    switch (status) {
      case "connected":
        return "Connected";
      case "connecting":
        return "Connecting...";
      case "error":
        return "Error";
      default:
        return "Disconnected";
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900/80 backdrop-blur-sm border border-zinc-700 text-white shadow-lg hover:bg-zinc-800 transition-all"
        title="Dev Tools"
      >
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
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>

      {/* Dev Tools Panel */}
      {isOpen && (
        <div className="w-64 rounded-lg border border-zinc-700 bg-zinc-900/95 backdrop-blur-md shadow-xl">
          <div className="border-b border-zinc-800 px-4 py-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Dev Tools</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {/* Connection Status */}
            <div>
              <div className="mb-2 text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Connection Status
              </div>
              <div className="space-y-2">
                {connections.map((connection, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${getStatusColor(
                          connection.status
                        )} ${connection.status === "connected" ? "animate-pulse" : ""}`}
                      />
                    <span className="text-xs text-white">
                      {connection.name}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span
                      className={`text-xs ${
                        connection.status === "connected"
                          ? "text-green-400"
                          : connection.status === "error"
                          ? "text-red-400"
                          : connection.status === "connecting"
                          ? "text-yellow-400"
                          : "text-zinc-400"
                      }`}
                    >
                      {getStatusText(connection.status)}
                    </span>
                    {connection.lastPrice && (
                      <span className="text-[10px] text-zinc-500">
                        ${connection.lastPrice.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    )}
                  </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-zinc-800">
              <button
                onClick={checkConnections}
                className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 transition-colors"
              >
                Refresh Status
              </button>
            </div>

            {/* Last Update */}
            {connections.some((c) => c.lastCheck) && (
              <div className="text-xs text-zinc-500 text-center">
                Last check:{" "}
                {connections
                  .find((c) => c.lastCheck)
                  ?.lastCheck?.toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

