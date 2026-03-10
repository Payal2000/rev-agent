"use client";

import { useState, useMemo } from "react";
import {
  ANOMALIES,
  WEEKLY_DIGEST,
  REVENUE_SIGNALS,
  CHURN_SIGNALS,
  COHORT_RETENTION,
  GROWTH_OPPORTUNITIES,
  SEGMENT_HEALTH,
  OPERATIONAL_ALERTS,
} from "@/lib/mock-data";
import { useLiveData } from "@/lib/hooks";
import AnomalyCard from "@/components/ui/AnomalyCard";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles, TrendingUp, TrendingDown, Minus, ArrowUpRight, Activity, AlertTriangle, AlertCircle, Lightbulb, Info, Building2, Users, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { KPI_COLORS } from "@/lib/kpi-colors";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label, Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

type Severity = "all" | "critical" | "high" | "medium" | "low";

const CARD = "bg-white/65 backdrop-blur-sm dark:bg-white/6 border-[3px] border-white dark:border-white/10 shadow-sm rounded-2xl";

// Segment colors — fill is pastel bg, text matches from KPI_COLORS
const SEGMENT_PASTEL = {
  Enterprise: { fill: KPI_COLORS.purple.bg, text: KPI_COLORS.purple.text },
  Growth:     { fill: KPI_COLORS.sky.bg,    text: KPI_COLORS.sky.text    },
  Starter:    { fill: KPI_COLORS.green.bg,  text: KPI_COLORS.green.text  },
} as const;

const segmentChartConfig: ChartConfig = {
  mrr: { label: "MRR" },
  Enterprise: { label: "Enterprise", color: SEGMENT_PASTEL.Enterprise.fill },
  Growth:     { label: "Growth",     color: SEGMENT_PASTEL.Growth.fill },
  Starter:    { label: "Starter",    color: SEGMENT_PASTEL.Starter.fill },
};

function RevenueSegmentDonut({ segmentHealth }: { segmentHealth: typeof SEGMENT_HEALTH }) {
  const segmentChartData = useMemo(() => segmentHealth.map(s => ({
    segment: s.tier,
    mrr: s.mrr,
    fill: SEGMENT_PASTEL[s.tier as keyof typeof SEGMENT_PASTEL]?.fill ?? s.color,
  })), [segmentHealth]);
  const totalMrr = useMemo(() => segmentChartData.reduce((s, d) => s + d.mrr, 0), [segmentChartData]);

  return (
    <div className={`${CARD} px-6 py-5 flex flex-col`}>
      <div style={{ marginBottom: 4 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 2px" }}>Revenue by Segment</p>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>MRR distribution across tiers</p>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <ChartContainer config={segmentChartConfig} className="mx-auto aspect-square max-h-[300px] w-full">
          <PieChart>
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel formatter={(val) => formatCurrency(val as number)} />} />
            <Pie data={segmentChartData} dataKey="mrr" nameKey="segment" innerRadius={85} strokeWidth={4}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={viewBox.cy} style={{ fill: "var(--text-primary)", fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                          {formatCurrency(totalMrr)}
                        </tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 24} style={{ fill: "var(--text-muted)", fontSize: 13 }}>
                          Total MRR
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", marginTop: 8 }}>
          {segmentChartData.map(d => {
            const pct = ((d.mrr / totalMrr) * 100).toFixed(1);
            const pastel = SEGMENT_PASTEL[d.segment as keyof typeof SEGMENT_PASTEL];
            return (
              <div key={d.segment} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: d.fill, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "var(--text-secondary)", flex: 1 }}>{d.segment}</span>
                <span style={{ fontSize: 12.5, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{pct}%</span>
                <span style={{ fontSize: 12.5, fontFamily: "var(--font-mono)", fontWeight: 700, color: pastel?.text ?? "var(--text-primary)" }}>{formatCurrency(d.mrr)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RetentionCell({ value }: { value: number | null }) {
  if (value === null) return <td style={{ padding: "14px 10px", textAlign: "center", borderBottom: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 13 }}>—</td>;
  const bg = value >= 90 ? "rgba(5,150,105,0.12)" : value >= 80 ? "rgba(234,179,8,0.12)" : "rgba(220,38,38,0.12)";
  const color = value >= 90 ? "var(--success)" : value >= 80 ? "var(--warning)" : "var(--danger)";
  return (
    <td style={{ padding: "14px 10px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>
      <span style={{ background: bg, color, fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 400, padding: "4px 10px", borderRadius: 999 }}>
        {value}%
      </span>
    </td>
  );
}

export default function InsightsPage() {
  const [filter, setFilter] = useState<Severity>("all");
  const [cohortExpanded, setCohortExpanded] = useState(true);
  const [growthExpanded, setGrowthExpanded] = useState(true);
  const { data: anomalies } = useLiveData("/api/insights/anomalies", ANOMALIES);
  const { data: signals } = useLiveData("/api/insights/signals", REVENUE_SIGNALS);
  const { data: churnSignals } = useLiveData("/api/insights/churn-signals", CHURN_SIGNALS);
  const { data: cohortRetention } = useLiveData("/api/insights/cohort-retention", COHORT_RETENTION);
  const { data: growthOpportunities } = useLiveData("/api/insights/growth-opportunities", GROWTH_OPPORTUNITIES);
  const { data: segmentHealth } = useLiveData("/api/insights/segment-health", SEGMENT_HEALTH);
  const { data: operationalAlerts } = useLiveData("/api/insights/operational-alerts", OPERATIONAL_ALERTS);
  const { data: digest, loading: digestLoading } = useLiveData("/api/insights/weekly-digest", WEEKLY_DIGEST);

  const filtered = filter === "all" ? anomalies : anomalies.filter((a: typeof ANOMALIES[0]) => a.severity === filter);
  const counts = {
    all: anomalies.length,
    critical: anomalies.filter((a: typeof ANOMALIES[0]) => a.severity === "critical").length,
    high: anomalies.filter((a: typeof ANOMALIES[0]) => a.severity === "high").length,
    medium: anomalies.filter((a: typeof ANOMALIES[0]) => a.severity === "medium").length,
    low: anomalies.filter((a: typeof ANOMALIES[0]) => a.severity === "low").length,
  };

  const FILTERS: { key: Severity; label: string; activeBg: string; activeBorder: string; activeText: string; dot: string }[] = [
    { key: "all",      label: "All",      activeBg: KPI_COLORS.purple.bg, activeBorder: `${KPI_COLORS.purple.text}44`, activeText: KPI_COLORS.purple.text, dot: "" },
    { key: "critical", label: "Critical", activeBg: KPI_COLORS.red.bg,    activeBorder: `${KPI_COLORS.red.text}44`,    activeText: KPI_COLORS.red.text,    dot: KPI_COLORS.red.text    },
    { key: "high",     label: "High",     activeBg: KPI_COLORS.orange.bg, activeBorder: `${KPI_COLORS.orange.text}44`, activeText: KPI_COLORS.orange.text, dot: KPI_COLORS.orange.text },
    { key: "medium",   label: "Medium",   activeBg: KPI_COLORS.yellow.bg, activeBorder: `${KPI_COLORS.yellow.text}44`, activeText: KPI_COLORS.yellow.text, dot: KPI_COLORS.yellow.text },
    { key: "low",      label: "Low",      activeBg: KPI_COLORS.green.bg,  activeBorder: `${KPI_COLORS.green.text}44`,  activeText: KPI_COLORS.green.text,  dot: KPI_COLORS.green.text  },
  ];

  return (
    <div className="flex flex-col gap-4 px-4 py-4 lg:px-6 lg:py-6 w-full">

      {/* Header + Revenue Signals */}
      <div className={`${CARD} px-6 py-5`}>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Insights</h1>
        <p className="mt-1 text-sm text-muted-foreground">AI-powered revenue intelligence · Last 30 days · Powered by Insights Agent</p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 pt-5">
          {signals.map((s: typeof REVENUE_SIGNALS[0]) => {
            const c = KPI_COLORS[s.colorKey as keyof typeof KPI_COLORS];
            return (
              <Card key={s.label} className="@container/card rounded-2xl shadow-sm border-0 dark:bg-white/5 dark:border-white/10" style={{ background: c.bg }}>
                <CardHeader>
                  <CardDescription>{s.label}</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {s.value}
                  </CardTitle>
                  <CardAction>
                    <Badge variant="outline">
                      {s.trend === "up" ? <TrendingUp className="size-3" /> : s.trend === "down" ? <TrendingDown className="size-3" /> : <Minus className="size-3" />}
                      {s.delta}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardFooter className="flex-col items-start gap-1.5 text-sm">
                  <div className="line-clamp-1 flex gap-2 font-medium">
                    {s.trend === "up" ? <TrendingUp className="size-4" /> : s.trend === "down" ? <TrendingDown className="size-4" /> : <Minus className="size-4" />}
                    {s.delta} this month
                  </div>
                  <div className="text-muted-foreground">{s.note}</div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── AI Insights + Revenue by Segment ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* AI Insights */}
        <div className={`${CARD} px-6 py-5`}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: "var(--accent-soft)", border: "1px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Sparkles size={13} color="var(--accent-ink)" />
            </span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>AI Insights</p>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                {digestLoading ? "Generating fresh insights…" : `Generated ${digest.generatedAt}`}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {digest.highlights.map((h: typeof WEEKLY_DIGEST.highlights[0] & { query?: string }, i: number) => {
              const kc = h.type === "warning" ? KPI_COLORS.orange : h.type === "positive" ? KPI_COLORS.green : KPI_COLORS.purple;
              const IconEl = h.type === "warning" ? AlertTriangle : h.type === "positive" ? Lightbulb : Activity;
              const cfg = { icon: <IconEl size={15} color={kc.text} />, iconBg: kc.bg, iconBorder: `${kc.text}44`, linkColor: kc.text };
              const chatHref = h.query
                ? `/chat?new=1&q=${encodeURIComponent(h.query)}`
                : `/chat?new=1&q=${encodeURIComponent(h.title)}`;
              return (
                <div key={i} style={{ padding: "14px 16px", borderRadius: 14, background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ width: 34, height: 34, borderRadius: "50%", background: cfg.iconBg, border: `1.5px solid ${cfg.iconBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {cfg.icon}
                    </span>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{h.title}</p>
                  </div>
                  <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "0 0 10px", lineHeight: 1.6 }}>{h.text}</p>
                  <Link href={chatHref} style={{ fontSize: 12.5, fontWeight: 600, color: cfg.linkColor, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    View Details <ArrowRight size={11} />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>

        {/* Revenue by Segment donut */}
        <RevenueSegmentDonut segmentHealth={segmentHealth} />
      </div>

      {/* ── Churn Intelligence + Cohort Retention ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Early churn signals */}
        <div className={`${CARD} px-6 py-5`}>
          <h2 className="section-title" style={{ marginBottom: 4 }}>Churn Intelligence</h2>
          <p className="section-subtitle" style={{ marginBottom: 14 }}>Early warning signals · {churnSignals.reduce((s: number, c: typeof CHURN_SIGNALS[0]) => s + c.accounts, 0)} accounts flagged</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {churnSignals.map((s: typeof CHURN_SIGNALS[0]) => {
              const kc = s.severity === "critical" ? KPI_COLORS.red : s.severity === "high" ? KPI_COLORS.orange : s.severity === "medium" ? KPI_COLORS.yellow : KPI_COLORS.green;
              const ChurnIcon = s.severity === "critical" || s.severity === "high" ? AlertTriangle : s.severity === "medium" ? AlertCircle : Info;
              const churnHref = `/chat?new=1&q=${encodeURIComponent(`Investigate churn signal: ${s.signal}. Which accounts are affected and what actions can we take?`)}`;
              return (
                <div key={s.signal} style={{ padding: "14px 16px", borderRadius: 14, background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  {/* Header: icon + signal + accounts */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ width: 34, height: 34, borderRadius: "50%", background: kc.bg, border: `1.5px solid ${kc.text}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <ChurnIcon size={15} color={kc.text} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", margin: 0, lineHeight: 1.3 }}>{s.signal}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: kc.text, color: (kc === KPI_COLORS.yellow || kc === KPI_COLORS.green) ? "#1a1a1a" : "white", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
                          {s.severity}
                        </span>
                        <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{s.accounts} accounts</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontFamily: "var(--font-mono)", fontWeight: 400, color: "var(--text-primary)", flexShrink: 0 }}>{formatCurrency(s.mrrAtRisk)}</span>
                  </div>
                  {/* Footer link */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Link href={churnHref} style={{ fontSize: 12.5, fontWeight: 400, color: "var(--text-primary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      Investigate in Chat <ArrowRight size={11} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cohort retention heatmap */}
        <div className={`${CARD}`} style={{ overflow: "hidden" }}>
          <button
            onClick={() => setCohortExpanded(v => !v)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", background: "none", border: "none", cursor: "pointer", borderBottom: cohortExpanded ? "1px solid var(--border-subtle)" : "none" }}
          >
            <div style={{ textAlign: "left" }}>
              <h2 className="section-title" style={{ margin: 0 }}>Cohort Retention</h2>
              <p className="section-subtitle" style={{ margin: 0 }}>Monthly retention by signup cohort</p>
            </div>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%", background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-muted)", flexShrink: 0 }}>
              {cohortExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </span>
          </button>
          {cohortExpanded && (
          <div style={{ padding: "16px 24px 20px" }}>
          <div className="table-scroll">
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", textAlign: "left", padding: "13px 20px", background: "var(--bg-surface)", borderRadius: "999px 0 0 999px" }}>Cohort</th>
                  {["M1", "M2", "M3", "M4", "M5"].map((m, mi) => (
                    <th key={m} style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", textAlign: "center", padding: "13px 10px", background: "var(--bg-surface)", minWidth: 48, borderRadius: mi === 4 ? "0 999px 999px 0" : undefined }}>{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohortRetention.map((row: typeof COHORT_RETENTION[0]) => (
                  <tr key={row.cohort}>
                    <td style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", padding: "14px 20px", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" }}>{row.cohort}</td>
                    <RetentionCell value={row.m1} />
                    <RetentionCell value={row.m2} />
                    <RetentionCell value={row.m3} />
                    <RetentionCell value={row.m4} />
                    <RetentionCell value={row.m5} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 12, fontSize: 10.5, color: "var(--text-muted)" }}>
            {[{ color: "rgba(5,150,105,0.12)", label: "≥90%" }, { color: "rgba(234,179,8,0.12)", label: "80–89%" }, { color: "rgba(220,38,38,0.12)", label: "<80%" }].map(l => (
              <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: l.color, border: "1px solid var(--border)" }} />
                {l.label}
              </span>
            ))}
          </div>
          </div>
          )}
        </div>
      </div>

      {/* ── Growth Opportunities ── */}
      <div className={`${CARD}`} style={{ overflow: "hidden" }}>
        <button
          onClick={() => setGrowthExpanded(v => !v)}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", background: "none", border: "none", cursor: "pointer", borderBottom: growthExpanded ? "1px solid var(--border-subtle)" : "none" }}
        >
          <div style={{ textAlign: "left" }}>
            <h2 className="section-title" style={{ margin: 0 }}>Growth Opportunities</h2>
            <p className="section-subtitle" style={{ margin: 0 }}>Accounts showing upsell or expansion signals</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link
              href={`/chat?new=1&q=${encodeURIComponent("Show me upsell and expansion playbooks for accounts showing growth signals")}`}
              className="inline-link"
              style={{ flexShrink: 0 }}
              onClick={e => e.stopPropagation()}
            >
              Get playbook <ArrowRight size={10} />
            </Link>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%", background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-muted)", flexShrink: 0 }}>
              {growthExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </span>
          </div>
        </button>
        {growthExpanded && (
        <div style={{ padding: "0 24px 24px" }}>
        <div className="table-scroll" style={{ marginTop: 16 }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 540 }}>
            <thead>
              <tr>
                {["Account", "Tier", "MRR", "Signal", "Potential", "Readiness"].map((h, hi, arr) => (
                  <th key={h} style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", textAlign: "left", padding: "13px 20px", background: "var(--bg-surface)", borderBottom: "none", borderRadius: hi === 0 ? "999px 0 0 999px" : hi === arr.length - 1 ? "0 999px 999px 0" : undefined }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {growthOpportunities.map((acc: typeof GROWTH_OPPORTUNITIES[0], i: number) => (
                <tr key={acc.id}>
                  <td style={{ padding: "17px 20px", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", borderBottom: i < growthOpportunities.length - 1 ? "1px solid var(--border)" : "none" }}>{acc.name}</td>
                  <td style={{ padding: "17px 20px", borderBottom: i < growthOpportunities.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: acc.tier === "Enterprise" ? KPI_COLORS.sky.bg : acc.tier === "Growth" ? KPI_COLORS.purple.bg : KPI_COLORS.green.bg, color: acc.tier === "Enterprise" ? KPI_COLORS.sky.text : acc.tier === "Growth" ? KPI_COLORS.purple.text : KPI_COLORS.green.text, border: `1px solid ${acc.tier === "Enterprise" ? KPI_COLORS.sky.text : acc.tier === "Growth" ? KPI_COLORS.purple.text : KPI_COLORS.green.text}33` }}>
                      {acc.tier}
                    </span>
                  </td>
                  <td style={{ padding: "17px 20px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 400, color: "var(--text-primary)", borderBottom: i < growthOpportunities.length - 1 ? "1px solid var(--border)" : "none" }}>{formatCurrency(acc.mrr)}</td>
                  <td style={{ padding: "17px 20px", fontSize: 13, color: "var(--text-secondary)", borderBottom: i < growthOpportunities.length - 1 ? "1px solid var(--border)" : "none" }}>{acc.signal}</td>
                  <td style={{ padding: "17px 20px", borderBottom: i < growthOpportunities.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <span style={{ fontSize: 13, fontFamily: "var(--font-mono)", fontWeight: 400, color: "var(--success)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                      <ArrowUpRight size={13} />{acc.potential}
                    </span>
                  </td>
                  <td style={{ padding: "17px 20px", borderBottom: i < growthOpportunities.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 60, height: 4, borderRadius: 2, background: "var(--bg-elevated)", overflow: "hidden" }}>
                        <div style={{ width: `${acc.readiness}%`, height: "100%", background: acc.readiness >= 85 ? "var(--success)" : "var(--accent-ink)", borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-secondary)" }}>{acc.readiness}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
        )}
      </div>

      {/* ── Segment Health + Operational Alerts ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Segment health */}
        <div className={`${CARD} px-6 py-5`}>
          <h2 className="section-title" style={{ marginBottom: 4 }}>Segment Health</h2>
          <p className="section-subtitle" style={{ marginBottom: 14 }}>Health score by tier · Churn rate · NRR</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {segmentHealth.map((seg: typeof SEGMENT_HEALTH[0]) => {
              const kc = SEGMENT_PASTEL[seg.tier as keyof typeof SEGMENT_PASTEL] ?? { fill: KPI_COLORS.gray.bg, text: KPI_COLORS.gray.text };
              const colors = { bg: kc.fill, text: kc.text };
              const TierIcon = seg.tier === "Enterprise" ? Building2 : seg.tier === "Growth" ? Users : Zap;

              return (
                <div key={seg.tier} style={{ padding: "14px 16px", borderRadius: 14, background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span style={{ width: 34, height: 34, borderRadius: "50%", background: colors.bg, border: `1.5px solid ${colors.text}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <TierIcon size={15} color={colors.text} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", margin: 0, lineHeight: 1.3 }}>{seg.tier}</p>
                      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: colors.text }}>
                        {seg.accounts} accounts
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {seg.trend === "up" ? <TrendingUp size={12} color={KPI_COLORS.green.text} /> : seg.trend === "down" ? <TrendingDown size={12} color={KPI_COLORS.red.text} /> : <Minus size={12} color="var(--text-muted)" />}
                      <span style={{ fontSize: 14, fontWeight: 400, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{seg.health}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>/100</span>
                    </div>
                  </div>
                  {/* Health bar */}
                  <div style={{ width: "100%", height: 4, borderRadius: 2, background: "var(--bg-elevated)", overflow: "hidden", marginBottom: 10 }}>
                    <div style={{ width: `${seg.health}%`, height: "100%", background: colors.text, borderRadius: 2, opacity: 0.7 }} />
                  </div>
                  {/* Metric badges */}
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" as const }}>
                    <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 400, background: KPI_COLORS.amber.bg, color: KPI_COLORS.amber.text, padding: "2px 8px", borderRadius: 999, border: `1px solid ${KPI_COLORS.amber.text}33` }}>
                      {formatCurrency(seg.mrr)}
                    </span>
                    <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 400, background: seg.churnRate > 3 ? KPI_COLORS.red.bg : KPI_COLORS.green.bg, color: seg.churnRate > 3 ? KPI_COLORS.red.text : KPI_COLORS.green.text, padding: "2px 8px", borderRadius: 999, border: `1px solid ${seg.churnRate > 3 ? KPI_COLORS.red.text : KPI_COLORS.green.text}33` }}>
                      {seg.churnRate}% churn
                    </span>
                    <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 400, background: KPI_COLORS.teal.bg, color: KPI_COLORS.teal.text, padding: "2px 8px", borderRadius: 999, border: `1px solid ${KPI_COLORS.teal.text}33` }}>
                      {seg.nrr}% NRR
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Operational alerts */}
        <div className={`${CARD} px-6 py-5`}>
          <h2 className="section-title" style={{ marginBottom: 4 }}>Operational Alerts</h2>
          <p className="section-subtitle" style={{ marginBottom: 14 }}>Payments · Billing · Conversions</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {operationalAlerts.map((a: typeof OPERATIONAL_ALERTS[0]) => {
              const kc = a.status === "critical" ? KPI_COLORS.red : a.status === "warning" ? KPI_COLORS.orange : KPI_COLORS.purple;
              const AlertIcon = a.status === "critical" ? AlertTriangle : a.status === "warning" ? AlertCircle : Info;
              const alertHref = `/chat?new=1&q=${encodeURIComponent(`Investigate operational alert: ${a.label} (${a.value}). What is causing this and what should we do?`)}`;
              return (
                <div key={a.id} style={{ padding: "14px 16px", borderRadius: 14, background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  {/* Header: icon + label + value */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ width: 34, height: 34, borderRadius: "50%", background: kc.bg, border: `1.5px solid ${kc.text}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <AlertIcon size={15} color={kc.text} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", margin: 0, lineHeight: 1.3 }}>{a.label}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: kc.text, color: "white", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
                          {a.status}
                        </span>
                        <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{a.sub}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 14, fontFamily: "var(--font-mono)", fontWeight: 400, color: "var(--text-primary)", flexShrink: 0 }}>{a.value}</span>
                  </div>
                  {/* Footer link */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Link href={alertHref} style={{ fontSize: 12.5, fontWeight: 400, color: "var(--text-primary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      Investigate in Chat <ArrowRight size={11} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
            <Link href={`/chat?new=1&q=${encodeURIComponent("Create a dunning campaign strategy for failed payments and at-risk accounts")}`} className="inline-link">
              Run dunning campaign <ArrowRight size={10} />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Anomaly Detection ── */}
      <div className={`${CARD} px-6 py-5`}>
        <div className="section-header" style={{ marginBottom: 14 }}>
          <div>
            <h2 className="section-title">Anomaly Detection</h2>
            <p className="section-subtitle">ML-detected anomalies · {anomalies.length} events · Powered by Insights Agent</p>
          </div>
          {/* Filter pills */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FILTERS.map(f => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 11px", borderRadius: 999,
                    border: `1px solid ${active ? f.activeBorder : "var(--border)"}`,
                    background: active ? f.activeBg : "var(--bg-surface)",
                    color: active ? f.activeText : "var(--text-muted)",
                    fontSize: 11.5, fontWeight: active ? 600 : 500,
                    cursor: "pointer", transition: "all 150ms",
                  }}
                >
                  {f.dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: f.dot, flexShrink: 0 }} />}
                  {f.label}
                  <span style={{
                    background: active ? "rgba(255,255,255,0.55)" : "var(--bg-elevated)",
                    color: active ? f.activeText : "var(--text-muted)",
                    padding: "1px 6px", borderRadius: 999, fontSize: 10, fontWeight: 700,
                    border: `1px solid ${active ? f.activeBorder : "var(--border)"}`,
                  }}>
                    {counts[f.key]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((anomaly, i) => (
              <div key={anomaly.id} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms`, opacity: 0 }}>
                <AnomalyCard {...anomaly} compact={false} />
              </div>
            ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text-muted)", fontSize: 13, border: "1px dashed var(--border)", borderRadius: 12, background: "var(--bg-elevated)" }}>
              <div style={{ marginBottom: 8, display: "inline-flex" }}>
                <CheckCircle2 size={24} color="var(--success)" />
              </div>
              <div>No {filter !== "all" ? filter : ""} anomalies detected</div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
