"use client"

import { Search, LayoutDashboard, TrendingUp, Lightbulb, MessageSquare, ArrowRight, X } from "lucide-react"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"

function FloatingSidebarTrigger() {
  const { open } = useSidebar()
  if (open) return null
  return (
    <div className="absolute left-3 z-50">
      <SidebarTrigger className="text-muted-foreground hover:text-foreground hover:bg-black/5" />
    </div>
  )
}

// ── Static nav shortcuts ──────────────────────────────────────────────────────
const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", description: "KPIs, MRR chart, at-risk accounts" },
  { label: "Insights", icon: Lightbulb, href: "/insights", description: "Anomalies, cohort retention, growth opportunities" },
  { label: "Forecasts", icon: TrendingUp, href: "/forecasts", description: "90-day MRR projection with confidence bands" },
  { label: "Chat", icon: MessageSquare, href: "/chat", description: "Ask the AI revenue analyst anything" },
]

const SUGGESTED_QUERIES = [
  "What is our current MRR?",
  "Show me churn rate trends",
  "Which accounts are at risk of churning?",
  "What are our top growth opportunities?",
  "Forecast MRR for the next 90 days",
  "Show subscription breakdown by tier",
  "What anomalies were detected this month?",
]

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type SyncStatus = {
  status: "ok" | "error";
  last_synced_at: string | null;
};

type WidgetHealthSummary = {
  status: "ok" | "error";
  summary: { healthy: number; total: number };
};

async function checkBackend(): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function fetchSyncStatus(): Promise<SyncStatus | null> {
  try {
    const r = await fetch(`${API_BASE}/health/data-sync`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    return (await r.json()) as SyncStatus;
  } catch {
    return null;
  }
}

async function fetchWidgetHealth(): Promise<WidgetHealthSummary | null> {
  try {
    const r = await fetch(`${API_BASE}/health/widget-status`, { signal: AbortSignal.timeout(3500) });
    if (!r.ok) return null;
    return (await r.json()) as WidgetHealthSummary;
  } catch {
    return null;
  }
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "n/a";
  const d = new Date(iso);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatEstDateTime(): string {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date());
  return `${date} ${time} EST`;
}

// ── Command Palette ───────────────────────────────────────────────────────────
function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("")
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filteredNav = query
    ? NAV_ITEMS.filter(
        n =>
          n.label.toLowerCase().includes(query.toLowerCase()) ||
          n.description.toLowerCase().includes(query.toLowerCase())
      )
    : NAV_ITEMS

  const filteredSuggestions = query
    ? SUGGESTED_QUERIES.filter(s => s.toLowerCase().includes(query.toLowerCase()))
    : SUGGESTED_QUERIES.slice(0, 4)

  // All selectable items in order: nav items first, then suggestions
  const allItems: Array<{ type: "nav"; href: string } | { type: "query"; q: string }> = [
    ...filteredNav.map(n => ({ type: "nav" as const, href: n.href })),
    ...filteredSuggestions.map(q => ({ type: "query" as const, q })),
    // If query is custom (not in suggestions), add "Ask AI" option at top
    ...(query.trim() && !SUGGESTED_QUERIES.includes(query.trim())
      ? [{ type: "query" as const, q: query.trim() }]
      : []),
  ]

  const navigate = useCallback(
    (item: (typeof allItems)[number]) => {
      if (item.type === "nav") {
        router.push(item.href)
      } else {
        router.push(`/chat?new=1&q=${encodeURIComponent(item.q)}`)
      }
      onClose()
    },
    [router, onClose]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose()
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, allItems.length - 1))
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    }
    if (e.key === "Enter") {
      e.preventDefault()
      if (allItems[activeIndex]) {
        navigate(allItems[activeIndex])
      } else if (query.trim()) {
        router.push(`/chat?new=1&q=${encodeURIComponent(query.trim())}`)
        onClose()
      }
    }
  }

  // Reset active index when results change
  useEffect(() => { setActiveIndex(0) }, [query])

  let itemIdx = 0

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Palette */}
      <div
        className="fixed left-1/2 top-[18%] z-50 w-full max-w-lg -translate-x-1/2"
        style={{ filter: "drop-shadow(0 20px 48px rgba(0,0,0,0.18))" }}
      >
        <div className="rounded-2xl bg-white/95 backdrop-blur-lg border border-black/10 overflow-hidden">

          {/* Input row */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-black/8">
            <Search size={15} className="text-muted-foreground/60 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search pages or ask AI anything..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-muted-foreground/50 hover:text-muted-foreground">
                <X size={13} />
              </button>
            )}
            <kbd className="text-[10px] text-muted-foreground/40 font-mono border border-black/10 rounded px-1.5 py-0.5">esc</kbd>
          </div>

          <div className="max-h-80 overflow-y-auto py-2">

            {/* Navigation section */}
            {filteredNav.length > 0 && (
              <div>
                <p className="px-4 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  {query ? "Pages" : "Navigation"}
                </p>
                {filteredNav.map(item => {
                  const idx = itemIdx++
                  const Icon = item.icon
                  return (
                    <button
                      key={item.href}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => navigate({ type: "nav", href: item.href })}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                      style={{ background: activeIndex === idx ? "var(--bg-elevated, #f5f3ff)" : "transparent" }}
                    >
                      <span className="flex items-center justify-center w-7 h-7 rounded-lg border border-black/8 bg-white shrink-0">
                        <Icon size={13} className="text-muted-foreground" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground">{item.label}</span>
                        <span className="block text-xs text-muted-foreground truncate">{item.description}</span>
                      </span>
                      <ArrowRight size={12} className="text-muted-foreground/30 shrink-0" />
                    </button>
                  )
                })}
              </div>
            )}

            {/* Query suggestions / Ask AI section */}
            {filteredSuggestions.length > 0 && (
              <div className={filteredNav.length > 0 ? "mt-1" : ""}>
                <p className="px-4 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  {query ? "Matching queries" : "Ask AI"}
                </p>
                {filteredSuggestions.map(suggestion => {
                  const idx = itemIdx++
                  return (
                    <button
                      key={suggestion}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => navigate({ type: "query", q: suggestion })}
                      className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
                      style={{ background: activeIndex === idx ? "var(--bg-elevated, #f5f3ff)" : "transparent" }}
                    >
                      <span className="flex items-center justify-center w-7 h-7 rounded-lg border border-black/8 bg-white shrink-0">
                        <MessageSquare size={12} className="text-purple-400" />
                      </span>
                      <span className="flex-1 text-sm text-foreground truncate">{suggestion}</span>
                      <span className="text-[10px] text-muted-foreground/40 shrink-0">Ask AI</span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Custom query option */}
            {query.trim() && !SUGGESTED_QUERIES.includes(query.trim()) && (
              <div className="border-t border-black/6 mt-1 pt-1">
                {(() => { const idx = itemIdx++; return (
                  <button
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => { router.push(`/chat?new=1&q=${encodeURIComponent(query.trim())}`); onClose() }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    style={{ background: activeIndex === idx ? "var(--bg-elevated, #f5f3ff)" : "transparent" }}
                  >
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-purple-50 border border-purple-200 shrink-0">
                      <MessageSquare size={12} className="text-purple-500" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground">Ask AI: </span>
                      <span className="text-sm text-muted-foreground">&quot;{query.trim()}&quot;</span>
                    </span>
                    <kbd className="text-[10px] text-muted-foreground/40 font-mono border border-black/10 rounded px-1.5 py-0.5">↵</kbd>
                  </button>
                )})()}
              </div>
            )}

            {/* Empty state */}
            {filteredNav.length === 0 && filteredSuggestions.length === 0 && !query.trim() && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground/50">No results</p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Site Header ───────────────────────────────────────────────────────────────
export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const [backendLive, setBackendLive] = useState<boolean | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [widgetHealth, setWidgetHealth] = useState<WidgetHealthSummary | null>(null);
  const [estNow, setEstNow] = useState<string>(formatEstDateTime());

  // ⌘K or ⌘F to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "f")) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [live, sync, widgets] = await Promise.all([
        checkBackend(),
        fetchSyncStatus(),
        fetchWidgetHealth(),
      ]);
      if (!mounted) return;
      setBackendLive(live);
      setSyncStatus(sync);
      setWidgetHealth(widgets);
    };
    load();
    const id = setInterval(load, 30000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setEstNow(formatEstDateTime()), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <header className="relative flex h-(--header-height) shrink-0 items-center transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
        <FloatingSidebarTrigger />

        {/* Search bar trigger */}
        <div className="flex flex-1 justify-start pl-4 pr-4">
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 w-full max-w-sm rounded-full border border-black/10 bg-white/80 px-4 py-2 shadow-sm text-muted-foreground hover:border-black/20 hover:bg-white/90 transition-all cursor-text"
          >
            <Search size={14} className="shrink-0 text-muted-foreground/60" />
            <span className="flex-1 text-xs text-left">Search or ask AI anything...</span>
            <kbd className="text-xs text-muted-foreground/50 font-mono">⌘K</kbd>
          </button>
        </div>

        {/* Right — bell */}
        <div className="absolute right-0 flex items-center pr-5">
          <div className="hidden md:flex items-center gap-2 mr-3">
            {backendLive !== null && (
              <span
                className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${
                  backendLive
                    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                    : "text-slate-600 bg-slate-100 border-slate-200"
                }`}
              >
                {backendLive ? "Live backend" : "Demo mode"}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground px-2 py-1 rounded-full border border-black/10 bg-white/70">
              Last sync: <span className="text-foreground">{formatRelativeTime(syncStatus?.last_synced_at ?? null)}</span>
            </span>
            <span className="text-[11px] text-muted-foreground px-2 py-1 rounded-full border border-black/10 bg-white/70">
              Widgets:{" "}
              <span className="text-foreground">
                {widgetHealth ? `${widgetHealth.summary.healthy}/${widgetHealth.summary.total}` : "n/a"}
              </span>
            </span>
            <span className="text-[11px] text-muted-foreground px-2 py-1 rounded-full border border-black/10 bg-white/70">
              {estNow}
            </span>
          </div>
          <button className="relative flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-black/5 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
          </button>
        </div>
      </header>

      {open && <CommandPalette onClose={() => setOpen(false)} />}
    </>
  )
}
