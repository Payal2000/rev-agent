"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, MessageSquare, Zap, TrendingUp,
  ChevronLeft, ChevronRight, Activity, User, X,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard"  },
  { href: "/chat",      icon: MessageSquare,   label: "Chat"       },
  { href: "/insights",  icon: Zap,             label: "Insights"   },
  { href: "/forecasts", icon: TrendingUp,      label: "Forecasts"  },
];

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (isMobile) onMobileClose();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const navItems = (
    <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
      {NAV.map(({ href, icon: Icon, label }) => {
        const active = pathname === href || (href !== "/" && pathname.startsWith(href));
        const isCollapsed = !isMobile && collapsed;

        return (
          <Link
            key={href}
            href={href}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 10,
              color: active ? "var(--accent-ink)" : "var(--text-secondary)",
              background: active ? "var(--accent-soft)" : "transparent",
              border: `1px solid ${active ? "var(--border-strong)" : "transparent"}`,
              transition: "all 160ms ease",
              overflow: "hidden",
              whiteSpace: "nowrap",
              fontWeight: active ? 600 : 500,
              fontSize: 13,
            }}
            onMouseEnter={e => {
              if (!active) {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "var(--bg-hover)";
                el.style.color = "var(--text-primary)";
                el.style.borderColor = "var(--border)";
              }
            }}
            onMouseLeave={e => {
              if (!active) {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "transparent";
                el.style.color = "var(--text-secondary)";
                el.style.borderColor = "transparent";
              }
            }}
          >
            <Icon size={15} strokeWidth={active ? 2.05 : 1.85} style={{ flexShrink: 0 }} />
            {!isCollapsed && label}
          </Link>
        );
      })}
    </nav>
  );

  const logo = (isCollapsed: boolean, showClose = false) => (
    <div style={{
      height: 60,
      display: "flex",
      alignItems: "center",
      padding: "0 16px",
      borderBottom: "1px solid var(--border)",
      flexShrink: 0,
      gap: 10,
      overflow: "hidden",
      justifyContent: "space-between",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 30,
          height: 30,
          borderRadius: 10,
          background: "linear-gradient(145deg, color-mix(in oklab, var(--accent) 75%, #fff 25%), var(--accent))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: "0 8px 18px rgba(30, 45, 36, 0.2)",
        }}>
          <Activity size={14} color="#f8fbf8" strokeWidth={2.25} />
        </div>
        {!isCollapsed && (
          <span style={{
            fontWeight: 600,
            fontSize: 18,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
            whiteSpace: "nowrap",
            fontFamily: "var(--font-display)",
          }}>
            RevAgent
          </span>
        )}
      </div>
      {showClose && (
        <button
          onClick={onMobileClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            padding: 6,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
          }}
        >
          <X size={15} />
        </button>
      )}
    </div>
  );

  const bottomSection = (isCollapsed: boolean) => (
    <div style={{
      borderTop: "1px solid var(--border)",
      padding: "10px 8px 12px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", borderRadius: 10, overflow: "hidden",
      }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "linear-gradient(145deg, var(--bg-elevated), var(--bg-hover))",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          <User size={13} color="var(--text-secondary)" />
        </div>
        {!isCollapsed && (
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Payal Nagaonkar
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Admin</div>
          </div>
        )}
      </div>

      {!isMobile && (
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 12px", borderRadius: 10, border: "1px solid transparent",
            background: "transparent", cursor: "pointer",
            color: "var(--text-muted)", width: "100%", textAlign: "left",
            fontSize: 12.5, transition: "all 150ms",
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "var(--bg-hover)";
            el.style.borderColor = "var(--border)";
            el.style.color = "var(--text-secondary)";
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "transparent";
            el.style.borderColor = "transparent";
            el.style.color = "var(--text-muted)";
          }}
        >
          {isCollapsed
            ? <ChevronRight size={15} style={{ flexShrink: 0 }} />
            : <><ChevronLeft size={15} style={{ flexShrink: 0 }} /><span>Collapse</span></>
          }
        </button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <>
        {mobileOpen && (
          <div className="sidebar-backdrop" onClick={onMobileClose} />
        )}
        <aside style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: 248,
          transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 250ms cubic-bezier(0.4,0,0.2,1)",
          zIndex: 50,
          background: "var(--bg-surface)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          {logo(false, true)}
          {navItems}
          {bottomSection(false)}
        </aside>
      </>
    );
  }

  return (
    <aside style={{
      width: collapsed ? 72 : 248,
      transition: "width 200ms cubic-bezier(0.4,0,0.2,1)",
      background: "var(--bg-surface)",
      borderRight: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      overflow: "hidden",
    }}>
      {logo(collapsed)}
      {navItems}
      {bottomSection(collapsed)}
    </aside>
  );
}
