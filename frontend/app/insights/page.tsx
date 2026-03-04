"use client";

import { useState } from "react";
import { ANOMALIES } from "@/lib/mock-data";
import AnomalyCard from "@/components/ui/AnomalyCard";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

type Severity = "all" | "critical" | "high" | "medium" | "low";

export default function InsightsPage() {
  const [filter, setFilter] = useState<Severity>("all");

  const filtered = filter === "all" ? ANOMALIES : ANOMALIES.filter(a => a.severity === filter);

  const counts = {
    all: ANOMALIES.length,
    critical: ANOMALIES.filter(a => a.severity === "critical").length,
    high:     ANOMALIES.filter(a => a.severity === "high").length,
    medium:   ANOMALIES.filter(a => a.severity === "medium").length,
    low:      ANOMALIES.filter(a => a.severity === "low").length,
  };

  const FILTERS: { key: Severity; label: string; color: string }[] = [
    { key: "all",      label: "All",      color: "var(--text-secondary)" },
    { key: "critical", label: "Critical", color: "#f43f5e" },
    { key: "high",     label: "High",     color: "#f97316" },
    { key: "medium",   label: "Medium",   color: "#f59e0b" },
    { key: "low",      label: "Low",      color: "#10b981" },
  ];

  return (
    <div className="page-content" style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em" }}>
          Insights
        </h1>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>
          Anomaly detection · Last 30 days · Powered by Insights Agent
        </p>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 12px", borderRadius: 20,
              border: `1px solid ${filter === f.key ? f.color : "var(--border)"}`,
              background: filter === f.key ? `${f.color}15` : "var(--bg-surface)",
              color: filter === f.key ? f.color : "var(--text-muted)",
              fontSize: 12, fontWeight: filter === f.key ? 600 : 400,
              cursor: "pointer", transition: "all 150ms",
            }}
          >
            {f.key !== "all" && (
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: f.color }} />
            )}
            {f.label}
            <span style={{
              background: "var(--bg-elevated)", color: "var(--text-muted)",
              padding: "1px 5px", borderRadius: 8, fontSize: 10, fontWeight: 600,
            }}>
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div style={{ position: "relative" }}>
        {/* Vertical line */}
        <div style={{
          position: "absolute", left: 7, top: 0, bottom: 0,
          width: 1, background: "var(--border)",
        }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {filtered.map((anomaly, i) => (
            <div
              key={anomaly.id}
              className="animate-fade-up"
              style={{ animationDelay: `${i * 60}ms`, opacity: 0, display: "flex", gap: 20, paddingBottom: 20, position: "relative" }}
            >
              {/* Timeline dot */}
              <div style={{
                width: 15, height: 15, borderRadius: "50%", flexShrink: 0, marginTop: 14,
                background: {
                  critical: "#f43f5e", high: "#f97316", medium: "#f59e0b", low: "#10b981"
                }[anomaly.severity],
                border: "2px solid var(--bg-base)",
                boxShadow: `0 0 8px ${{critical:"rgba(244,63,94,0.5)", high:"rgba(249,115,22,0.4)", medium:"rgba(245,158,11,0.4)", low:"rgba(16,185,129,0.3)"}[anomaly.severity]}`,
                position: "relative", zIndex: 1,
              }} />

              {/* Card */}
              <div style={{ flex: 1 }}>
                <AnomalyCard {...anomaly} compact={false} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <Link href="/chat" style={{
                    fontSize: 11.5, color: "#6366f1", textDecoration: "none",
                    display: "flex", alignItems: "center", gap: 3,
                  }}>
                    Investigate in Chat <ArrowRight size={10} />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{
            textAlign: "center", padding: "48px 24px",
            color: "var(--text-muted)", fontSize: 13,
          }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
            No {filter !== "all" ? filter : ""} anomalies detected
          </div>
        )}
      </div>
    </div>
  );
}
