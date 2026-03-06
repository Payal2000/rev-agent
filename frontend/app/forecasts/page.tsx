"use client";

import dynamic from "next/dynamic";
import { AT_RISK_ACCOUNTS } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const ForecastChart = dynamic(() => import("@/components/charts/ForecastChart"), { ssr: false });

const RISK_COLOR = (score: number) =>
  score >= 90 ? "var(--danger)" : score >= 75 ? "var(--warning)" : score >= 60 ? "var(--accent)" : "var(--success)";

const CARD = "bg-[#fcfcfd] dark:bg-white/6 border-[3px] border-white dark:border-white/10 shadow-sm rounded-2xl";

export default function ForecastsPage() {
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6 max-w-5xl w-full mx-auto">
      {/* Header */}
      <div className={`${CARD} px-6 py-5`}>
        <h1 className="page-title">Forecasts</h1>
        <p className="page-subtitle">90-day MRR projection · Holt-Winters + confidence intervals</p>
      </div>

      {/* Forecast metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "30-Day MRR", value: 434200, ci: "$426.8K – $441.6K", trend: "+2.5%", color: "var(--accent-ink)" },
          { label: "60-Day MRR", value: 444800, ci: "$433.2K – $456.4K", trend: "+4.9%", color: "var(--success)" },
          { label: "90-Day MRR", value: 456100, ci: "$440.2K – $472.0K", trend: "+7.6%", color: "var(--success)" },
        ].map((p, i) => (
          <div
            key={p.label}
            className={`${CARD} animate-fade-up p-5`}
            style={{ animationDelay: `${i * 60}ms`, opacity: 0 }}
          >
            <p style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-muted)", margin: 0 }}>
              {p.label}
            </p>
            <p style={{ fontSize: 27, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)", margin: "8px 0 4px", letterSpacing: "-0.03em" }}>
              {formatCurrency(p.value, true)}
            </p>
            <p style={{ fontSize: 12, color: p.color, fontWeight: 700, margin: "0 0 6px" }}>{p.trend} vs today</p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", margin: 0 }}>80% CI: {p.ci}</p>
          </div>
        ))}
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
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr>
                {["Account", "Tier", "MRR", "Risk", "Days to Churn", "Signals"].map(h => (
                  <th key={h} style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-muted)", textAlign: "left", padding: "0 12px 10px 0", borderBottom: "1px solid var(--border)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AT_RISK_ACCOUNTS.map((acc, i) => (
                <tr key={acc.id} style={{ borderBottom: i < AT_RISK_ACCOUNTS.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                  <td style={{ padding: "12px 12px 12px 0", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    {acc.name}
                  </td>
                  <td style={{ padding: "12px 12px 12px 0" }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: acc.tier === "Enterprise" ? "rgba(37,99,235,0.14)" : "var(--accent-soft)",
                      color: acc.tier === "Enterprise" ? "#2563eb" : "var(--accent-ink)",
                      border: `1px solid ${acc.tier === "Enterprise" ? "rgba(37,99,235,0.3)" : "var(--border-strong)"}`,
                    }}>
                      {acc.tier}
                    </span>
                  </td>
                  <td style={{ padding: "12px 12px 12px 0", fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--text-primary)", fontWeight: 600 }}>
                    {formatCurrency(acc.mrr)}
                  </td>
                  <td style={{ padding: "12px 12px 12px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 54, height: 4, borderRadius: 2, background: "var(--bg-elevated)", overflow: "hidden" }}>
                        <div style={{ width: `${acc.riskScore}%`, height: "100%", background: RISK_COLOR(acc.riskScore), borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: RISK_COLOR(acc.riskScore), fontWeight: 700 }}>
                        {acc.riskScore}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 12px 12px 0", fontSize: 12, color: acc.daysToChurn < 20 ? "var(--danger)" : "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                    {acc.daysToChurn}d
                  </td>
                  <td style={{ padding: "12px 0" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {acc.signals.map(s => (
                        <span key={s} style={{ fontSize: 10.5, padding: "2px 6px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-muted)" }}>
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
