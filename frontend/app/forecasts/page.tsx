"use client";

import dynamic from "next/dynamic";
import { AT_RISK_ACCOUNTS, METRICS_SUMMARY } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const ForecastChart = dynamic(() => import("@/components/charts/ForecastChart"), { ssr: false });

const RISK_COLOR = (score: number) =>
  score >= 90 ? "#f43f5e" : score >= 75 ? "#f97316" : score >= 60 ? "#f59e0b" : "#10b981";

export default function ForecastsPage() {
  return (
    <div className="page-content" style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em" }}>
          Forecasts
        </h1>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>
          90-day MRR projection · Holt-Winters + confidence intervals
        </p>
      </div>

      {/* Projection cards */}
      <div className="forecast-grid">
        {[
          { label: "30-Day MRR",  value: 434200, ci: "$426.8K – $441.6K", trend: "+2.5%", color: "#6366f1" },
          { label: "60-Day MRR",  value: 444800, ci: "$433.2K – $456.4K", trend: "+4.9%", color: "#8b5cf6" },
          { label: "90-Day MRR",  value: 456100, ci: "$440.2K – $472.0K", trend: "+7.6%", color: "#a78bfa" },
        ].map((p, i) => (
          <div
            key={p.label}
            className="animate-fade-up"
            style={{
              animationDelay: `${i * 60}ms`, opacity: 0,
              background: "var(--bg-surface)", border: "1px solid var(--border)",
              borderRadius: 12, padding: "18px 20px",
            }}
          >
            <p style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-muted)", margin: 0 }}>
              {p.label}
            </p>
            <p style={{ fontSize: 26, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)", margin: "8px 0 4px", letterSpacing: "-0.03em" }}>
              {formatCurrency(p.value, true)}
            </p>
            <p style={{ fontSize: 12, color: p.color, fontWeight: 600, margin: "0 0 6px" }}>{p.trend} vs today</p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>80% CI: {p.ci}</p>
          </div>
        ))}
      </div>

      {/* Forecast chart */}
      <div style={{
        background: "var(--bg-surface)", border: "1px solid var(--border)",
        borderRadius: 14, padding: "20px 24px", marginBottom: 24,
      }}
        className="animate-fade-up delay-200"
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>MRR Projection</h2>
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
              Actuals + projected with 80% and 95% confidence bands
            </p>
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 11.5 }}>
            {[
              { color: "#6366f1", label: "Actual" },
              { color: "#6366f180", label: "P50 forecast" },
              { color: "#6366f130", label: "80% CI" },
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
      <div style={{
        background: "var(--bg-surface)", border: "1px solid var(--border)",
        borderRadius: 14, padding: "20px 20px",
      }}
        className="animate-fade-up delay-250"
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>At-Risk Accounts</h2>
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
              ML churn prediction model · {AT_RISK_ACCOUNTS.length} accounts flagged
            </p>
          </div>
          <Link href="/chat" style={{ fontSize: 11.5, color: "#6366f1", textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}>
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
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                    background: acc.tier === "Enterprise" ? "rgba(139,92,246,0.15)" : "rgba(99,102,241,0.1)",
                    color: acc.tier === "Enterprise" ? "#a78bfa" : "#818cf8",
                    border: `1px solid ${acc.tier === "Enterprise" ? "rgba(139,92,246,0.3)" : "rgba(99,102,241,0.2)"}`,
                  }}>
                    {acc.tier}
                  </span>
                </td>
                <td style={{ padding: "12px 12px 12px 0", fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--text-primary)", fontWeight: 600 }}>
                  {formatCurrency(acc.mrr)}
                </td>
                <td style={{ padding: "12px 12px 12px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    {/* Risk bar */}
                    <div style={{ width: 50, height: 4, borderRadius: 2, background: "var(--bg-elevated)", overflow: "hidden" }}>
                      <div style={{ width: `${acc.riskScore}%`, height: "100%", background: RISK_COLOR(acc.riskScore), borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: RISK_COLOR(acc.riskScore), fontWeight: 700 }}>
                      {acc.riskScore}
                    </span>
                  </div>
                </td>
                <td style={{ padding: "12px 12px 12px 0", fontSize: 12, color: acc.daysToChurn < 20 ? "#f43f5e" : "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                  {acc.daysToChurn}d
                </td>
                <td style={{ padding: "12px 0" }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {acc.signals.map(s => (
                      <span key={s} style={{ fontSize: 10.5, padding: "1px 6px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-muted)" }}>
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

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "var(--text-muted)" }}>
            Total MRR at risk:&nbsp;
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "#f43f5e" }}>
              {formatCurrency(AT_RISK_ACCOUNTS.reduce((s, a) => s + a.mrr, 0))}
            </span>
          </span>
          <span style={{ color: "var(--text-muted)" }}>
            ARR at risk:&nbsp;
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "#f59e0b" }}>
              {formatCurrency(AT_RISK_ACCOUNTS.reduce((s, a) => s + a.mrr, 0) * 12, true)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
