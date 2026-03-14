"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, CircleCheck, TriangleAlert, CircleOff } from "lucide-react";
import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import { useLiveData } from "@/lib/hooks";
import { KPI_COLORS } from "@/lib/kpi-colors";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

type WidgetHealth = {
  name: string;
  source_table: string;
  status: "live" | "stale" | "empty";
  row_count: number;
  last_updated_at: string | null;
  age_hours: number | null;
  reason: string;
};

type WidgetHealthPayload = {
  status: "ok" | "error";
  widgets: Record<string, WidgetHealth>;
  summary: { healthy: number; total: number };
};

const FALLBACK: WidgetHealthPayload = {
  status: "ok",
  widgets: {},
  summary: { healthy: 0, total: 0 },
};

const chartConfig = {
  health: { label: "Health", color: KPI_COLORS.blue.bg },
} satisfies ChartConfig;

const HEALTH_WIDGET_COLORS = {
  blue: { fill: KPI_COLORS.blue.bg, text: KPI_COLORS.blue.text, border: `${KPI_COLORS.blue.text}44` },
  pink: { fill: KPI_COLORS.pink.bg, text: KPI_COLORS.pink.text, border: `${KPI_COLORS.pink.text}44` },
  amber: { fill: KPI_COLORS.amber.bg, text: KPI_COLORS.amber.text, border: `${KPI_COLORS.amber.text}44` },
  gray: { fill: KPI_COLORS.gray.bg, text: KPI_COLORS.gray.text, border: `${KPI_COLORS.gray.text}44` },
} as const;

const statusTone = (status: WidgetHealth["status"]) => {
  if (status === "live") {
    return {
      bg: HEALTH_WIDGET_COLORS.blue.fill,
      text: HEALTH_WIDGET_COLORS.blue.text,
      border: HEALTH_WIDGET_COLORS.blue.border,
    };
  }
  if (status === "stale") {
    return {
      bg: HEALTH_WIDGET_COLORS.pink.fill,
      text: HEALTH_WIDGET_COLORS.pink.text,
      border: HEALTH_WIDGET_COLORS.pink.border,
    };
  }
  return {
    bg: HEALTH_WIDGET_COLORS.gray.fill,
    text: HEALTH_WIDGET_COLORS.gray.text,
    border: HEALTH_WIDGET_COLORS.gray.border,
  };
};

const statusIcon = (status: WidgetHealth["status"]) => {
  if (status === "live") return <CircleCheck size={14} style={{ color: HEALTH_WIDGET_COLORS.blue.text }} />;
  if (status === "stale") return <TriangleAlert size={14} style={{ color: HEALTH_WIDGET_COLORS.pink.text }} />;
  return <CircleOff size={14} style={{ color: HEALTH_WIDGET_COLORS.gray.text }} />;
};

function formatTime(iso: string | null): string {
  if (!iso) return "n/a";
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function coveragePct(rowCount: number, maxRows: number): number {
  if (maxRows <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((rowCount / maxRows) * 100)));
}

export function WidgetHealthPanel() {
  const [expanded, setExpanded] = useState(false);
  const { data } = useLiveData<WidgetHealthPayload>(
    "/health/widget-status",
    FALLBACK,
    { pollMs: 30000, allowFallback: false, timeoutMs: 5000 },
  );

  const rows = useMemo(() => Object.entries(data.widgets || {}), [data.widgets]);
  const issues = useMemo(
    () => rows.filter(([, w]) => w.status !== "live"),
    [rows],
  );
  const healthyPct = data.summary.total > 0
    ? Math.round((data.summary.healthy / data.summary.total) * 100)
    : 0;
  const maxRows = useMemo(
    () => Math.max(1, ...rows.map(([, w]) => w.row_count)),
    [rows],
  );
  const liveCount = useMemo(
    () => rows.filter(([, w]) => w.status === "live").length,
    [rows],
  );
  const staleCount = useMemo(
    () => rows.filter(([, w]) => w.status === "stale").length,
    [rows],
  );
  const emptyCount = useMemo(
    () => rows.filter(([, w]) => w.status === "empty").length,
    [rows],
  );

  const freshnessScore = (w: WidgetHealth) => {
    if (w.age_hours === null) return 10;
    return Math.max(10, Math.min(100, Math.round(100 - w.age_hours * 4)));
  };

  const avgCoverage = useMemo(() => {
    if (rows.length === 0) return 0;
    const total = rows.reduce((sum, [, w]) => sum + coveragePct(w.row_count, maxRows), 0);
    return Math.round(total / rows.length);
  }, [rows, maxRows]);

  const avgFreshness = useMemo(() => {
    if (rows.length === 0) return 0;
    const total = rows.reduce((sum, [, w]) => sum + freshnessScore(w), 0);
    return Math.round(total / rows.length);
  }, [rows]);

  const qualityRows = useMemo(
    () => [
      { label: "Coverage", value: avgCoverage, tone: HEALTH_WIDGET_COLORS.blue },
      { label: "Freshness", value: avgFreshness, tone: HEALTH_WIDGET_COLORS.amber },
      { label: "Reliability", value: healthyPct, tone: HEALTH_WIDGET_COLORS.pink },
      { label: "Issue Load", value: rows.length === 0 ? 0 : Math.round((issues.length / rows.length) * 100), tone: HEALTH_WIDGET_COLORS.gray },
    ],
    [avgCoverage, avgFreshness, healthyPct, rows.length, issues.length],
  );

  const healthChartData = useMemo(
    () => [{ name: "health", health: healthyPct, fill: healthyPct >= 85 ? HEALTH_WIDGET_COLORS.blue.fill : healthyPct >= 60 ? HEALTH_WIDGET_COLORS.pink.fill : HEALTH_WIDGET_COLORS.gray.fill }],
    [healthyPct],
  );

  const healthLabel = healthyPct >= 85 ? "Excellent" : healthyPct >= 60 ? "Moderate" : "Needs Attention";
  const healthLabelColor = healthyPct >= 85
    ? { bg: HEALTH_WIDGET_COLORS.blue.fill, text: HEALTH_WIDGET_COLORS.blue.text, border: HEALTH_WIDGET_COLORS.blue.border }
    : healthyPct >= 60
      ? { bg: HEALTH_WIDGET_COLORS.pink.fill, text: HEALTH_WIDGET_COLORS.pink.text, border: HEALTH_WIDGET_COLORS.pink.border }
      : { bg: HEALTH_WIDGET_COLORS.gray.fill, text: HEALTH_WIDGET_COLORS.gray.text, border: HEALTH_WIDGET_COLORS.gray.border };

  return (
    <div className="bg-white/65 backdrop-blur-sm dark:bg-white/6 border-[3px] border-white dark:border-white/10 shadow-sm rounded-2xl px-6 py-5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-foreground">Widget Health Details</span>
          <span className="text-xs text-muted-foreground">
            {data.summary.healthy}/{data.summary.total} healthy
          </span>
          {issues.length > 0 && (
            <span
              className="text-xs rounded-full border px-2 py-0.5"
              style={{
                background: KPI_COLORS.pink.bg,
                color: KPI_COLORS.pink.text,
                borderColor: `${KPI_COLORS.pink.text}44`,
              }}
            >
              {issues.length} issue{issues.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-white/90 bg-white/70 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">Data Readiness Score</span>
                <span
                  className="text-[11px] rounded-full border px-2 py-0.5"
                  style={{ background: healthLabelColor.bg, color: healthLabelColor.text, borderColor: healthLabelColor.border }}
                >
                  {healthLabel}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {issues.length} issue{issues.length === 1 ? "" : "s"} · {data.summary.total} widgets tracked
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[320px,1fr] items-start gap-5">
              <ChartContainer
                config={chartConfig}
                className="mx-auto aspect-square max-h-[240px] w-full"
              >
                <RadialBarChart
                  data={healthChartData}
                  startAngle={180}
                  endAngle={0}
                  innerRadius={80}
                  outerRadius={115}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel formatter={(value) => `${value}%`} />}
                  />
                  <RadialBar dataKey="health" cornerRadius={10} background />
                  <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" className="fill-foreground text-4xl font-semibold">
                    {healthyPct}%
                  </text>
                  <text x="50%" y="67%" textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground text-xs">
                    Overall Health
                  </text>
                </RadialBarChart>
              </ChartContainer>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {qualityRows.map((row) => (
                    <div key={row.label} className="rounded-lg border border-white/90 bg-white/75 px-3 py-2">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className="font-semibold text-foreground">{row.value}%</span>
                      </div>
                      <div
                        className="h-1.5 w-full rounded-full overflow-hidden"
                        style={{ background: row.tone.fill }}
                      >
                        <div className="h-full transition-all" style={{ width: `${row.value}%`, background: row.tone.text }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className="text-[11px] rounded-full border px-2 py-0.5"
                    style={{ background: HEALTH_WIDGET_COLORS.blue.fill, color: HEALTH_WIDGET_COLORS.blue.text, borderColor: HEALTH_WIDGET_COLORS.blue.border }}
                  >
                    Live {liveCount}
                  </span>
                  <span
                    className="text-[11px] rounded-full border px-2 py-0.5"
                    style={{ background: HEALTH_WIDGET_COLORS.pink.fill, color: HEALTH_WIDGET_COLORS.pink.text, borderColor: HEALTH_WIDGET_COLORS.pink.border }}
                  >
                    Stale {staleCount}
                  </span>
                  <span
                    className="text-[11px] rounded-full border px-2 py-0.5"
                    style={{ background: HEALTH_WIDGET_COLORS.gray.fill, color: HEALTH_WIDGET_COLORS.gray.text, borderColor: HEALTH_WIDGET_COLORS.gray.border }}
                  >
                    Empty {emptyCount}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {rows.length === 0 && (
            <div className="text-xs text-muted-foreground">No widget diagnostics returned yet.</div>
          )}
          {rows.length > 0 && (
            <div className="rounded-xl border border-white/90 bg-white/70 overflow-hidden">
              <div className="grid grid-cols-[minmax(200px,1.2fr)_90px_100px_100px_120px] gap-3 px-4 py-2.5 border-b border-slate-200/70 text-[11px] font-medium text-muted-foreground">
                <span>Widget</span>
                <span>Status</span>
                <span>Coverage</span>
                <span>Freshness</span>
                <span>Last Updated</span>
              </div>
              {rows.map(([key, widget]) => {
                const tone = statusTone(widget.status);
                const rowCoverage = coveragePct(widget.row_count, maxRows);
                const fresh = freshnessScore(widget);
                return (
                  <div key={key} className="px-4 py-2.5 border-b border-slate-100/90 last:border-b-0 hover:bg-white/75 transition-colors">
                    <div className="grid grid-cols-[minmax(200px,1.2fr)_90px_100px_100px_120px] gap-3 items-center">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {statusIcon(widget.status)}
                          <span className="text-sm font-medium text-foreground truncate">{widget.name}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{widget.source_table} · {widget.reason}</p>
                      </div>
                      <span
                        className="justify-self-start text-[11px] px-2 py-0.5 rounded-full border"
                        style={{ background: tone.bg, color: tone.text, borderColor: tone.border }}
                      >
                        {widget.status.toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[11px] text-foreground">{rowCoverage}%</div>
                        <div className="h-1.5 w-full rounded-full overflow-hidden mt-1" style={{ background: HEALTH_WIDGET_COLORS.blue.fill }}>
                          <div className="h-full transition-all" style={{ width: `${rowCoverage}%`, background: HEALTH_WIDGET_COLORS.blue.text }} />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] text-foreground">{widget.age_hours === null ? "n/a" : `${widget.age_hours}h`}</div>
                        <div className="h-1.5 w-full rounded-full overflow-hidden mt-1" style={{ background: HEALTH_WIDGET_COLORS.amber.fill }}>
                          <div className="h-full transition-all" style={{ width: `${fresh}%`, background: HEALTH_WIDGET_COLORS.amber.text }} />
                        </div>
                      </div>
                      <div className="text-[11px] text-muted-foreground">{formatTime(widget.last_updated_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
