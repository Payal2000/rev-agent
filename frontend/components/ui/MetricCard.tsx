"use client";

import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import SparkLine from "@/components/charts/SparkLine";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

interface Props {
  label: string;
  value: number;
  format: "currency" | "percent" | "number";
  delta?: number;            // percent change
  deltaInverse?: boolean;    // true for churn (lower = better)
  sparkline?: number[];
  icon: LucideIcon;
  delay?: number;
}

function fmt(v: number, format: "currency" | "percent" | "number"): string {
  if (format === "currency") return formatCurrency(v, true);
  if (format === "percent")  return `${v}%`;
  return formatNumber(v);
}

export default function MetricCard({
  label, value, format, delta, deltaInverse, sparkline, icon: Icon, delay = 0,
}: Props) {
  const isPositive = deltaInverse ? (delta ?? 0) < 0 : (delta ?? 0) > 0;
  const isNegative = deltaInverse ? (delta ?? 0) > 0 : (delta ?? 0) < 0;

  const deltaColor    = isPositive ? "#10b981" : isNegative ? "#f43f5e" : "#7a94b8";
  const deltaBg       = isPositive ? "rgba(16,185,129,0.1)" : isNegative ? "rgba(244,63,94,0.1)" : "rgba(122,148,184,0.1)";
  const sparkColor    = isPositive ? "#10b981" : isNegative ? "#f43f5e" : "#6366f1";

  return (
    <div
      className="animate-fade-up"
      style={{
        animationDelay: `${delay}ms`,
        opacity: 0,
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        transition: "border-color 150ms",
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "#2e4060"}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em",
          textTransform: "uppercase", color: "var(--text-muted)",
        }}>
          {label}
        </span>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={14} color="var(--text-secondary)" strokeWidth={1.75} />
        </div>
      </div>

      {/* Value */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div className="tabular" style={{
            fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em",
            color: "var(--text-primary)", lineHeight: 1,
            fontFamily: "var(--font-mono)",
          }}>
            {fmt(value, format)}
          </div>
          {delta !== undefined && (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              marginTop: 6, padding: "2px 7px", borderRadius: 20,
              background: deltaBg, fontSize: 11.5, fontWeight: 600,
              color: deltaColor,
            }}>
              {isPositive ? <TrendingUp size={11} /> : isNegative ? <TrendingDown size={11} /> : <Minus size={11} />}
              <span className="tabular">{formatPercent(delta)}</span>
            </div>
          )}
        </div>

        {/* Sparkline */}
        {sparkline && sparkline.length > 0 && (
          <SparkLine data={sparkline} color={sparkColor} width={72} height={32} />
        )}
      </div>
    </div>
  );
}
