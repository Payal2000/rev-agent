"use client";

import { usePathname } from "next/navigation";
import { Bell, Wifi, WifiOff, Menu } from "lucide-react";
import { useEffect, useState } from "react";

const BREADCRUMBS: Record<string, string> = {
  "/":          "Dashboard",
  "/chat":      "Chat",
  "/insights":  "Insights",
  "/forecasts": "Forecasts",
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function checkBackend(): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}

interface TopBarProps {
  onMenuClick: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const pathname = usePathname();
  const [live, setLive] = useState<boolean | null>(null);

  useEffect(() => { checkBackend().then(setLive); }, []);

  const crumb = BREADCRUMBS[pathname] ?? "RevAgent";

  return (
    <header style={{
      height: 56,
      background: "var(--bg-surface)",
      borderBottom: "1px solid var(--border)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 24px",
      flexShrink: 0,
      gap: 12,
    }}>
      {/* Left: hamburger (mobile only) + breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          className="hamburger"
          onClick={onMenuClick}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"}
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>RevAgent</span>
          <span style={{ color: "var(--border)", fontSize: 12 }}>/</span>
          <span style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 600 }}>{crumb}</span>
        </div>
      </div>

      {/* Right: status + bell + date */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {live !== null && (
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            fontSize: 11.5, fontWeight: 500,
            color: live ? "#10b981" : "var(--text-muted)",
          }}>
            {live ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span>{live ? "Live" : "Demo"}</span>
          </div>
        )}

        <button style={{
          position: "relative", background: "none", border: "none",
          cursor: "pointer", color: "var(--text-muted)", padding: 4, borderRadius: 6,
          display: "flex", alignItems: "center",
          transition: "color 150ms",
        }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"}
        >
          <Bell size={15} />
          <span style={{
            position: "absolute", top: 3, right: 3,
            width: 6, height: 6, borderRadius: "50%",
            background: "#f43f5e",
            border: "1.5px solid var(--bg-surface)",
          }} />
        </button>

        <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          className="page-header-actions"
        >
          {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
      </div>
    </header>
  );
}
