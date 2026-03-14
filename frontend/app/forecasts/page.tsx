"use client";

import dynamic from "next/dynamic";
import { AT_RISK_ACCOUNTS, FORECAST_DATA } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";
import { KPI_COLORS } from "@/lib/kpi-colors";
import { TrendingUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLiveData } from "@/lib/hooks";
import type { ForecastPoint } from "@/components/charts/ForecastChart";
import { DataTable } from "@/components/data-table";

const ForecastChart = dynamic(() => import("@/components/charts/ForecastChart"), { ssr: false });

const CARD = "bg-white/65 backdrop-blur-sm dark:bg-white/6 border-[3px] border-white dark:border-white/10 shadow-sm rounded-2xl";

type ForecastApiResponse = { data: ForecastPoint[]; stats: { p30: number; p60: number; p90: number; ci80: { low: number; high: number }; currentMrr: number; trend: string } | null };
type AtRiskAccount = {
  id: string | number;
  name: string;
  tier: string;
  mrr: number;
  riskScore: number;
  daysToChurn: number;
  signals: string[] | string;
};

export default function ForecastsPage() {
  const { data: forecast, error: forecastError, source: forecastSource } = useLiveData<ForecastApiResponse>(
    "/api/forecast/mrr",
    { data: FORECAST_DATA, stats: null },
    { pollMs: 30000, allowFallback: false },
  );
  const { data: atRisk } = useLiveData<AtRiskAccount[]>(
    "/api/metrics/at-risk-accounts",
    AT_RISK_ACCOUNTS,
    { pollMs: 30000, allowFallback: false },
  );

  const stats = forecast.stats;
  const currentMrr = stats?.currentMrr ?? 423800;

  const kpiCards = stats
    ? [
        { label: "30-Day MRR", value: stats.p30, ci: `${formatCurrency(stats.ci80.low, true)} – ${formatCurrency(stats.ci80.high, true)}`, trend: `${((stats.p30 - currentMrr) / currentMrr * 100).toFixed(1)}%`, kpiColor: KPI_COLORS.blue },
        { label: "60-Day MRR", value: stats.p60, ci: `${formatCurrency(stats.ci80.low, true)} – ${formatCurrency(stats.ci80.high, true)}`, trend: `${((stats.p60 - currentMrr) / currentMrr * 100).toFixed(1)}%`, kpiColor: KPI_COLORS.yellow },
        { label: "90-Day MRR", value: stats.p90, ci: `${formatCurrency(stats.ci80.low, true)} – ${formatCurrency(stats.ci80.high, true)}`, trend: `${((stats.p90 - currentMrr) / currentMrr * 100).toFixed(1)}%`, kpiColor: KPI_COLORS.gray },
      ]
    : [
        { label: "30-Day MRR", value: 434200, ci: "$426.8K – $441.6K", trend: "+2.5%", kpiColor: KPI_COLORS.blue },
        { label: "60-Day MRR", value: 444800, ci: "$433.2K – $456.4K", trend: "+4.9%", kpiColor: KPI_COLORS.yellow },
        { label: "90-Day MRR", value: 456100, ci: "$440.2K – $472.0K", trend: "+7.6%", kpiColor: KPI_COLORS.gray },
      ];

  return (
    <div className="flex flex-col gap-4 px-4 py-4 lg:px-6 lg:py-6 w-full">
      {(forecastError || forecastSource !== "live") && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {forecastError
            ? `Live backend fetch failed: ${forecastError}`
            : "Using fallback data. Backend is not fully reachable."}
        </div>
      )}
      {/* Header */}
      <div className={`${CARD} px-6 py-5`}>
        <h1 className="page-title">Forecasts</h1>
        <p className="page-subtitle">90-day MRR projection · Holt-Winters + confidence intervals</p>
        {/* KPI cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mt-5">
          {kpiCards.map((p) => (
            <Card key={p.label} className="@container/card rounded-2xl shadow-sm border-0 dark:bg-white/5 dark:border-white/10" style={{ background: p.kpiColor.bg }}>
              <CardHeader>
                <CardDescription>{p.label}</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  {formatCurrency(p.value, true)}
                </CardTitle>
                <CardAction>
                  <Badge variant="outline" className="border-black/25 bg-white/60 text-foreground">
                    <TrendingUp className="size-3" />
                    {p.trend}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardFooter className="flex-col items-start gap-1.5 text-sm">
                <div className="line-clamp-1 flex gap-2 font-medium">
                  {p.trend} vs today <TrendingUp className="size-4" />
                </div>
                <div className="text-muted-foreground">80% CI: {p.ci}</div>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>

      {/* MRR Projection chart */}
      <div className={`${CARD} p-6 animate-fade-up delay-200`}>
        <div className="section-header">
          <div>
            <h2 className="section-title">MRR Projection</h2>
            <p className="section-subtitle">Actuals + projected with 80% and 95% confidence bands</p>
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 11.5, flexShrink: 0 }}>
            {[
              { color: "#7c6eaa", label: "Actual", dashed: false },
              { color: "#4880d4", label: "P50 forecast", dashed: true },
              { color: "#4880d4", label: "80% CI", dashed: true, band: true },
            ].map(l => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-muted)" }}>
                {l.band ? (
                  <span style={{ width: 20, height: 8, background: `${l.color}33`, border: `1px dashed ${l.color}88`, borderRadius: 2 }} />
                ) : (
                  <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke={l.color} strokeWidth="2.5" strokeDasharray={l.dashed ? "7 4" : "none"} /></svg>
                )}
                {l.label}
              </div>
            ))}
          </div>
        </div>
        <ForecastChart chartData={forecast.data} />
      </div>

      {/* At-risk accounts: use the same table component as Dashboard */}
      <DataTable data={atRisk} />
    </div>
  );
}
