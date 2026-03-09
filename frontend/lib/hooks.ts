"use client";

import { useState, useEffect } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Fetch live data from the FastAPI backend.
 * Falls back to `fallback` if the backend is unreachable or returns an error.
 */
export function useLiveData<T>(path: string, fallback: T): { data: T; loading: boolean; error: string | null } {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          // Keep using fallback silently — backend may not be running
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [path]);

  return { data, loading, error };
}
