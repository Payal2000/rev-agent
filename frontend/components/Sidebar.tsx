"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, MessageSquare, Zap, TrendingUp,
  ChevronLeft, ChevronRight, Activity, Settings, User
} from "lucide-react";

const NAV = [
  { href: "/",          icon: LayoutDashboard, label: "Dashboard"  },
  { href: "/chat",      icon: MessageSquare,   label: "Chat"       },
  { href: "/insights",  icon: Zap,             label: "Insights"   },
  { href: "/forecasts", icon: TrendingUp,      label: "Forecasts"  },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: collapsed ? 64 : 240,
        transition: "width 200ms cubic-bezier(0.4,0,0.2,1)",
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {/* Logo */}
      <div style={{
        height: 56,
        display: "flex",
        alignItems: "center",
        padding: collapsed ? "0 20px" : "0 20px",
        borderBottom: "1px solid var(--border-subtle)",
        flexShrink: 0,
        gap: 10,
        overflow: "hidden",
      }}>
        {/* Signal icon */}
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          boxShadow: "0 0 12px rgba(99,102,241,0.3)",
        }}>
          <Activity size={14} color="white" strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <span style={{
            fontWeight: 700,
            fontSize: 15,
            color: "var(--text-primary)",
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
          }}>
            RevAgent
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: collapsed ? "9px 12px" : "9px 12px",
                borderRadius: 8,
                textDecoration: "none",
                color: active ? "#818cf8" : "var(--text-secondary)",
                background: active ? "rgba(99,102,241,0.1)" : "transparent",
                borderLeft: active ? "2px solid #6366f1" : "2px solid transparent",
                transition: "all 150ms ease",
                overflow: "hidden",
                whiteSpace: "nowrap",
                fontWeight: active ? 600 : 400,
                fontSize: 13.5,
              }}
              onMouseEnter={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
                  (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                }
              }}
            >
              <Icon size={16} strokeWidth={active ? 2 : 1.75} style={{ flexShrink: 0 }} />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div style={{
        borderTop: "1px solid var(--border-subtle)",
        padding: "12px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}>
        {/* User */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 12px", borderRadius: 8, overflow: "hidden",
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: "50%",
            background: "linear-gradient(135deg, #1e2b42, #2d3f5c)",
            border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <User size={13} color="var(--text-secondary)" />
          </div>
          {!collapsed && (
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                Payal Nagaonkar
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Admin</div>
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 12px", borderRadius: 8, border: "none",
            background: "transparent", cursor: "pointer",
            color: "var(--text-muted)", width: "100%", textAlign: "left",
            fontSize: 13,
            transition: "all 150ms",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
            (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
          }}
        >
          {collapsed
            ? <ChevronRight size={15} style={{ flexShrink: 0 }} />
            : <><ChevronLeft size={15} style={{ flexShrink: 0 }} /><span>Collapse</span></>
          }
        </button>
      </div>
    </aside>
  );
}
