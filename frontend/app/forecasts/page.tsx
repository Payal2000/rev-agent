"use client";

import dynamic from "next/dynamic";
import { AT_RISK_ACCOUNTS } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";
import { KPI_COLORS } from "@/lib/kpi-colors";
import Link from "next/link";
import { ArrowRight, TrendingUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const ForecastChart = dynamic(() => import("@/components/charts/ForecastChart"), { ssr: false });

const RISK_COLOR = (score: number) =>
  score >= 90 ? "var(--danger)" : score >= 75 ? "var(--warning)" : score >= 60 ? "var(--accent)" : "var(--success)";

const CARD = "bg-white/65 backdrop-blur-sm dark:bg-white/6 border-[3px] border-white dark:border-white/10 shadow-sm rounded-2xl";

export default function ForecastsPage() {
  return (
    <div className="flex flex-col gap-4 px-4 py-4 lg:px-6 lg:py-6 w-full">
      {/* Header */}
      <div className={`${CARD} px-6 py-5`}>
        <h1 className="page-title">Forecasts</h1>
        <p className="page-subtitle">90-day MRR projection · Holt-Winters + confidence intervals</p>
        {/* KPI cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mt-5">
          {[
            { label: "30-Day MRR", value: 434200, ci: "$426.8K – $441.6K", trend: "+2.5%", kpiColor: KPI_COLORS.blue },
            { label: "60-Day MRR", value: 444800, ci: "$433.2K – $456.4K", trend: "+4.9%", kpiColor: KPI_COLORS.yellow },
            { label: "90-Day MRR", value: 456100, ci: "$440.2K – $472.0K", trend: "+7.6%", kpiColor: KPI_COLORS.gray },
          ].map((p) => (
            <Card key={p.label} className="@container/card rounded-2xl shadow-sm border-0 dark:bg-white/5 dark:border-white/10" style={{ background: p.kpiColor.bg }}>
              <CardHeader>
                <CardDescription>{p.label}</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  {formatCurrency(p.value, true)}
                </CardTitle>
                <CardAction>
                  <Badge variant="outline">
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
              { color: "var(--primary)", label: "Actual" },
              { color: "color-mix(in oklab, var(--primary) 65%, transparent)", label: "P50 forecast" },
              { color: "color-mix(in oklab, var(--primary) 26%, transparent)", label: "80% CI" },
            ].map(l => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-muted)" }}>
                <span style={{ width: 20, height: 2, background: l.color, borderRadius: 1 }} />
                {l.label}
              </div>
            ))}
          </div>
        </div>
        <ForecastChart />
      </div>

      {/* At-risk accounts */}
      <div className={`${CARD} p-6 animate-fade-up delay-250`}>
        <div className="section-header">
          <div>
            <h2 className="section-title">At-Risk Accounts</h2>
            <p className="section-subtitle">ML churn prediction model · {AT_RISK_ACCOUNTS.length} accounts flagged</p>
          </div>
          <Link href="/chat" className="inline-link" style={{ flexShrink: 0 }}>
            Get recommendations <ArrowRight size={10} />
          </Link>
        </div>

        <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 560 }}>
            <thead>
              <tr>
                {["Account", "Tier", "MRR", "Risk", "Days to Churn", "Signals"].map((h, hi, arr) => (
                  <th key={h} style={{ fontSize: 14, fontWeight: 500, color: "#111111", textAlign: "left", padding: "13px 20px", background: "#ffffff", borderBottom: "none", borderRadius: hi === 0 ? "999px 0 0 999px" : hi === arr.length - 1 ? "0 999px 999px 0" : undefined }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AT_RISK_ACCOUNTS.map((acc, i) => (
                <tr key={acc.id}>
                  <td style={{ padding: "17px 20px", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", borderBottom: i < AT_RISK_ACCOUNTS.length - 1 ? "1px solid #ebebeb" : "none" }}>
                    {acc.name}
                  </td>
                  <td style={{ padding: "17px 20px", borderBottom: i < AT_RISK_ACCOUNTS.length - 1 ? "1px solid #ebebeb" : "none" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: acc.tier === "Enterprise" ? KPI_COLORS.sky.bg : KPI_COLORS.purple.bg, color: acc.tier === "Enterprise" ? KPI_COLORS.sky.text : KPI_COLORS.purple.text, border: `1px solid ${acc.tier === "Enterprise" ? KPI_COLORS.sky.text : KPI_COLORS.purple.text}33` }}>
                      {acc.tier}
                    </span>
                  </td>
                  <td style={{ padding: "17px 20px", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-primary)", fontWeight: 600, borderBottom: i < AT_RISK_ACCOUNTS.length - 1 ? "1px solid #ebebeb" : "none" }}>
                    {formatCurrency(acc.mrr)}
                  </td>
                  <td style={{ padding: "17px 20px", borderBottom: i < AT_RISK_ACCOUNTS.length - 1 ? "1px solid #ebebeb" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 54, height: 4, borderRadius: 2, background: "var(--bg-elevated)", overflow: "hidden" }}>
                        <div style={{ width: `${acc.riskScore}%`, height: "100%", background: RISK_COLOR(acc.riskScore), borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: RISK_COLOR(acc.riskScore), fontWeight: 700 }}>
                        {acc.riskScore}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: "17px 20px", fontSize: 13, color: acc.daysToChurn < 20 ? "var(--danger)" : "var(--text-secondary)", fontFamily: "var(--font-mono)", borderBottom: i < AT_RISK_ACCOUNTS.length - 1 ? "1px solid #ebebeb" : "none" }}>
                    {acc.daysToChurn}d
                  </td>
                  <td style={{ padding: "17px 20px", borderBottom: i < AT_RISK_ACCOUNTS.length - 1 ? "1px solid #ebebeb" : "none" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {acc.signals.map(s => (
                        <span key={s} style={{ fontSize: 11, padding: "2px 7px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-muted)" }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "var(--text-muted)" }}>
            Total MRR at risk:&nbsp;
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--danger)" }}>
              {formatCurrency(AT_RISK_ACCOUNTS.reduce((s, a) => s + a.mrr, 0))}
            </span>
          </span>
          <span style={{ color: "var(--text-muted)" }}>
            ARR at risk:&nbsp;
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--warning)" }}>
              {formatCurrency(AT_RISK_ACCOUNTS.reduce((s, a) => s + a.mrr, 0) * 12, true)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
