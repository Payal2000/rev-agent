"use client";

import { useState } from "react";
import { ANOMALIES } from "@/lib/mock-data";
import AnomalyCard from "@/components/ui/AnomalyCard";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

type Severity = "all" | "critical" | "high" | "medium" | "low";

const CARD = "bg-[#fcfcfd] dark:bg-white/6 border-[3px] border-white dark:border-white/10 shadow-sm rounded-2xl";

export default function InsightsPage() {
  const [filter, setFilter] = useState<Severity>("all");

  const filtered = filter === "all" ? ANOMALIES : ANOMALIES.filter(a => a.severity === filter);

  const counts = {
    all: ANOMALIES.length,
    critical: ANOMALIES.filter(a => a.severity === "critical").length,
    high: ANOMALIES.filter(a => a.severity === "high").length,
    medium: ANOMALIES.filter(a => a.severity === "medium").length,
    low: ANOMALIES.filter(a => a.severity === "low").length,
  };

  const FILTERS: { key: Severity; label: string; color: string }[] = [
    { key: "all", label: "All", color: "var(--text-secondary)" },
    { key: "critical", label: "Critical", color: "var(--danger)" },
    { key: "high", label: "High", color: "var(--warning)" },
    { key: "medium", label: "Medium", color: "var(--warning)" },
    { key: "low", label: "Low", color: "var(--success)" },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6 max-w-4xl w-full mx-auto">
      {/* Header */}
      <div className={`${CARD} px-6 py-5`}>
        <h1 className="page-title">Insights</h1>
        <p className="page-subtitle">Anomaly detection · Last 30 days · Powered by Insights Agent</p>
      </div>

      {/* Filter pills */}
      <div className={`${CARD} px-6 py-4 flex gap-2 flex-wrap`}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 999,
              border: `1px solid ${filter === f.key ? f.color : "var(--border)"}`,
              background: filter === f.key ? "color-mix(in oklab, var(--bg-elevated) 60%, transparent)" : "var(--bg-surface)",
              color: filter === f.key ? f.color : "var(--text-muted)",
              fontSize: 12,
              fontWeight: filter === f.key ? 600 : 500,
              cursor: "pointer",
              transition: "all 150ms",
            }}
          >
            {f.key !== "all" && (
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: f.color }} />
            )}
            {f.label}
            <span style={{
              background: "var(--bg-elevated)",
              color: "var(--text-muted)",
              padding: "1px 6px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              border: "1px solid var(--border)",
            }}>
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Anomaly list */}
      <div className={`${CARD} px-6 py-5`}>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 7, top: 0, bottom: 0, width: 1, background: "var(--border)" }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {filtered.map((anomaly, i) => (
              <div
                key={anomaly.id}
                className="animate-fade-up"
                style={{ animationDelay: `${i * 60}ms`, opacity: 0, display: "flex", gap: 20, paddingBottom: 20, position: "relative" }}
              >
                <div style={{
                  width: 15,
                  height: 15,
                  borderRadius: "50%",
                  flexShrink: 0,
                  marginTop: 14,
                  background: {
                    critical: "var(--danger)",
                    high: "var(--warning)",
                    medium: "var(--warning)",
                    low: "var(--success)",
                  }[anomaly.severity],
                  border: "2px solid var(--bg-surface)",
                  position: "relative",
                  zIndex: 1,
                }} />

                <div style={{ flex: 1 }}>
                  <AnomalyCard {...anomaly} compact={false} />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <Link href="/chat" className="inline-link">
                      Investigate in Chat <ArrowRight size={10} />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div style={{
              textAlign: "center",
              padding: "48px 24px",
              color: "var(--text-muted)",
              fontSize: 13,
              border: "1px dashed var(--border)",
              borderRadius: 12,
              background: "var(--bg-elevated)",
            }}>
              <div style={{ marginBottom: 8, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <CheckCircle2 size={24} color="var(--success)" />
              </div>
              No {filter !== "all" ? filter : ""} anomalies detected
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
