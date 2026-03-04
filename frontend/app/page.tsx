"use client";

import Link from "next/link";
import { DollarSign, Users, TrendingUp, TrendingDown, BarChart2, ArrowRight, MessageSquare } from "lucide-react";
import MetricCard from "@/components/ui/MetricCard";
import AnomalyCard from "@/components/ui/AnomalyCard";
import AgentBadge from "@/components/ui/AgentBadge";
import dynamic from "next/dynamic";
import {
  METRICS_SUMMARY, ANOMALIES, RECENT_QUERIES, MRR_TREND,
} from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

const MRRChart = dynamic(() => import("@/components/charts/MRRChart"), { ssr: false });
const TierChart = dynamic(() => import("@/components/charts/TierChart"), { ssr: false });

// Sparkline data derived from MRR_TREND totals
const MRR_SPARKLINE = MRR_TREND.map(m => m.total);
const CHURN_SPARKLINE = [1.8, 1.9, 1.8, 2.0, 1.9, 2.0, 2.1, 2.0, 1.9, 2.0, 2.1, 2.1];

export default function DashboardPage() {
  return (
    <div className="page-content" style={{ maxWidth: 1400 }}>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em" }}>
              Revenue Dashboard
            </h1>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>
              Morning briefing · {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <Link href="/chat" style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--accent-dim, rgba(99,102,241,0.12))",
            border: "1px solid rgba(99,102,241,0.3)",
            color: "#818cf8", textDecoration: "none",
            padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            transition: "all 150ms",
          }}>
            <MessageSquare size={14} />
            Ask a question
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      {/* Metric cards */}
      <div className="metric-grid">
        <MetricCard
          label="Monthly Recurring Revenue"
          value={METRICS_SUMMARY.mrr}
          format="currency"
          delta={METRICS_SUMMARY.mrrDelta}
          sparkline={MRR_SPARKLINE}
          icon={DollarSign}
          delay={0}
        />
        <MetricCard
          label="Active Subscribers"
          value={METRICS_SUMMARY.subscribers}
          format="number"
          delta={(METRICS_SUMMARY.subscribersDelta / METRICS_SUMMARY.subscribersPrev) * 100}
          icon={Users}
          delay={50}
        />
        <MetricCard
          label="Net Revenue Retention"
          value={METRICS_SUMMARY.nrr}
          format="percent"
          delta={1.2}
          icon={TrendingUp}
          delay={100}
        />
        <MetricCard
          label="Monthly Churn Rate"
          value={METRICS_SUMMARY.churnRate}
          format="percent"
          delta={0.3}
          deltaInverse
          sparkline={CHURN_SPARKLINE}
          icon={TrendingDown}
          delay={150}
        />
      </div>

      {/* MRR chart */}
      <div style={{
        background: "var(--bg-surface)", border: "1px solid var(--border)",
        borderRadius: 14, padding: "20px 24px", marginBottom: 24,
      }}
        className="animate-fade-up delay-200"
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>MRR Breakdown</h2>
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
              12 months · New, Expansion, Contraction, Churned
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
              {formatCurrency(METRICS_SUMMARY.mrr, true)}
            </span>
            <span style={{ fontSize: 12, color: "#10b981", fontWeight: 600 }}>
              +{METRICS_SUMMARY.mrrDelta}%
            </span>
          </div>
        </div>
        <MRRChart />
        <Link href="/chat" style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: 11.5, color: "var(--text-muted)", textDecoration: "none",
          marginTop: 12, transition: "color 150ms",
        }}>
          Explore in Chat <ArrowRight size={10} />
        </Link>
      </div>

      {/* 2-column: Anomalies + Tier breakdown */}
      <div className="two-col-grid">

        {/* Anomalies */}
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 20px" }}
          className="animate-fade-up delay-250"
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Recent Anomalies</h2>
            <Link href="/insights" style={{ fontSize: 11.5, color: "#6366f1", textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}>
              View all <ArrowRight size={10} />
            </Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ANOMALIES.slice(0, 3).map(a => (
              <AnomalyCard key={a.id} {...a} compact />
            ))}
          </div>
        </div>

        {/* Tier chart */}
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 20px" }}
          className="animate-fade-up delay-250"
        >
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 16px" }}>Revenue by Tier</h2>
          <TierChart />
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border-subtle)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Total ARR</span>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                {formatCurrency(METRICS_SUMMARY.arr, true)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Net Revenue Retention</span>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", color: "#10b981" }}>
                {METRICS_SUMMARY.nrr}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent queries */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 20px" }}
        className="animate-fade-up"
        style2={{ animationDelay: "300ms" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Recent Queries</h2>
          <Link href="/chat" style={{ fontSize: 11.5, color: "#6366f1", textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}>
            Open chat <ArrowRight size={10} />
          </Link>
        </div>
        <div className="table-scroll">
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
          <thead>
            <tr>
              {["Query", "Agent", "Time", "When"].map(h => (
                <th key={h} style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-muted)", textAlign: "left", padding: "0 0 10px", borderBottom: "1px solid var(--border)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RECENT_QUERIES.map((q, i) => (
              <tr key={q.id} style={{ borderBottom: i < RECENT_QUERIES.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                <td style={{ padding: "11px 0", fontSize: 13, color: "var(--text-primary)", maxWidth: 340 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                    {q.query}
                  </span>
                </td>
                <td style={{ padding: "11px 16px 11px 0" }}>
                  <AgentBadge agent={q.agent} />
                </td>
                <td style={{ padding: "11px 16px 11px 0", fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                  {q.duration}
                </td>
                <td style={{ padding: "11px 0", fontSize: 11.5, color: "var(--text-muted)" }}>
                  {q.timestamp}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
