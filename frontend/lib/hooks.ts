"use client";

import { useState, useEffect, useRef } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const IS_PROD = process.env.NODE_ENV === "production";
const DEFAULT_ALLOW_FALLBACK = !IS_PROD && process.env.NEXT_PUBLIC_ALLOW_MOCK_FALLBACK === "true";

function emptyFromTemplate<T>(template: T): T {
  if (Array.isArray(template)) return [] as unknown as T;
  if (template === null || template === undefined) return template;
  if (typeof template === "number") return 0 as T;
  if (typeof template === "string") return "" as T;
  if (typeof template === "boolean") return false as T;
  if (typeof template === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(template as Record<string, unknown>)) {
      out[k] = emptyFromTemplate(v);
    }
    return out as T;
  }
  return template;
}

/**
 * Fetch live data from the FastAPI backend.
 * By default, fallback is disabled unless NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=true.
 */
export function useLiveData<T>(
  path: string,
  fallback: T,
  options?: { pollMs?: number; allowFallback?: boolean; timeoutMs?: number },
): { data: T; loading: boolean; error: string | null; source: "live" | "fallback" } {
  const pollMs = options?.pollMs ?? 0;
  const timeoutMs = options?.timeoutMs ?? 8000;
  const allowFallback = !IS_PROD && (options?.allowFallback ?? DEFAULT_ALLOW_FALLBACK);
  const fallbackRef = useRef<T>(fallback);
  fallbackRef.current = fallback;
  const [data, setData] = useState<T>(allowFallback ? fallback : emptyFromTemplate(fallback));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"live" | "fallback">("fallback");

  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}${path}`, {
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setError(null);
          setSource("live");
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Unknown error";
          setError(message);
          if (allowFallback) {
            setData(fallbackRef.current);
            setSource("fallback");
          } else {
            setData(emptyFromTemplate(fallbackRef.current));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    if (pollMs > 0) {
      timerId = setInterval(load, pollMs);
    }

    return () => {
      cancelled = true;
      if (timerId) clearInterval(timerId);
    };
  }, [path, allowFallback, pollMs, timeoutMs]);

  return { data, loading, error, source };
}
