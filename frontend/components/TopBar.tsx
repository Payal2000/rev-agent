"use client";

import { usePathname } from "next/navigation";
import {
  Bell, Wifi, WifiOff, Menu, Sun, Moon,
  CircleDot, Compass,
} from "lucide-react";
import { useEffect, useState } from "react";

const BREADCRUMBS: Record<string, string> = {
  "/":          "Home",
  "/dashboard": "Dashboard",
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
  theme: "dark" | "light";
  onThemeToggle: () => void;
}

export default function TopBar({ onMenuClick, theme, onThemeToggle }: TopBarProps) {
  const pathname = usePathname();
  const [live, setLive] = useState<boolean | null>(null);

  useEffect(() => { checkBackend().then(setLive); }, []);

  const crumb = BREADCRUMBS[pathname] ?? "RevAgent";

  const iconBtnStyle: React.CSSProperties = {
    position: "relative",
    background: "transparent",
    border: "1px solid transparent",
    cursor: "pointer",
    color: "var(--text-muted)",
    width: 32,
    height: 32,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "color 150ms, background 150ms, border-color 150ms",
  };

  return (
    <header className="topbar-header">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          className="hamburger"
          onClick={onMenuClick}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color = "var(--text-primary)";
            el.style.background = "var(--bg-hover)";
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color = "var(--text-muted)";
            el.style.background = "transparent";
          }}
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            color: "var(--text-muted)",
            fontSize: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}>
            <Compass size={12} />
            RevAgent
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: 11.5 }}>/</span>
          <span style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 600 }}>{crumb}</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {live !== null && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11.5,
            fontWeight: 600,
            color: live ? "var(--success)" : "var(--text-muted)",
            padding: "5px 9px",
            borderRadius: 999,
            border: "1px solid var(--border)",
            background: live ? "var(--success-soft)" : "var(--bg-elevated)",
          }}>
            {live ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span>{live ? "Live backend" : "Demo mode"}</span>
          </div>
        )}

        <button
          style={iconBtnStyle}
          onClick={onThemeToggle}
          aria-label="Toggle theme"
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color = "var(--text-primary)";
            el.style.background = "var(--bg-hover)";
            el.style.borderColor = "var(--border)";
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color = "var(--text-muted)";
            el.style.background = "transparent";
            el.style.borderColor = "transparent";
          }}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        <button
          style={iconBtnStyle}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color = "var(--text-primary)";
            el.style.background = "var(--bg-hover)";
            el.style.borderColor = "var(--border)";
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color = "var(--text-muted)";
            el.style.background = "transparent";
            el.style.borderColor = "transparent";
          }}
        >
          <Bell size={15} />
          <CircleDot
            size={10}
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              color: "var(--warning)",
              fill: "var(--warning)",
              background: "var(--bg-surface)",
              borderRadius: 999,
            }}
          />
        </button>

        <span
          style={{
            fontSize: 11.5,
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            borderLeft: "1px solid var(--border)",
            paddingLeft: 10,
          }}
          className="page-header-actions"
        >
          {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
      </div>
    </header>
  );
}
