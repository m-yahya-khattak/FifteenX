"use client";

import { useState } from "react";

export default function ApiTest() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const testApi = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/test-polymarket");
      const data = await response.json();
      
      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || data.message || "API test failed");
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to test API");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Polymarket API Test</h3>
        <button
          onClick={testApi}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Testing..." : "Test API Connection"}
        </button>
      </div>

      {loading && (
        <div className="text-center text-zinc-400">Testing connection...</div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4">
          <div className="mb-2 flex items-center gap-2">
            <svg
              className="h-5 w-5 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="font-semibold text-red-400">Error</span>
          </div>
          <p className="text-sm text-red-300">{error}</p>
          {result && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-red-400">
                Show details
              </summary>
              <pre className="mt-2 overflow-auto rounded bg-zinc-900 p-2 text-xs text-zinc-300">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}

      {result && !error && (
        <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4">
          <div className="mb-2 flex items-center gap-2">
            <svg
              className="h-5 w-5 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="font-semibold text-green-400">Success!</span>
          </div>
          <p className="mb-2 text-sm text-green-300">{result.message}</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-green-400">
              Show API response
            </summary>
            <div className="mt-2 space-y-2 text-xs">
              <div>
                <span className="text-zinc-400">Endpoint: </span>
                <span className="text-zinc-300">{result.endpoint}</span>
              </div>
              <div>
                <span className="text-zinc-400">Timestamp: </span>
                <span className="text-zinc-300">{result.timestamp}</span>
              </div>
              <pre className="mt-2 overflow-auto rounded bg-zinc-900 p-2 text-xs text-zinc-300">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </div>
          </details>
        </div>
      )}

      {!loading && !result && !error && (
        <div className="text-center text-sm text-zinc-400">
          Click the button above to test your Polymarket API connection
        </div>
      )}
    </div>
  );
}



