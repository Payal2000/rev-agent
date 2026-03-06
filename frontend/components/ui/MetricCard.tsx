"use client";

import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import SparkLine from "@/components/charts/SparkLine";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

interface Props {
  label: string;
  value: number;
  format: "currency" | "percent" | "number";
  delta?: number;
  deltaInverse?: boolean;
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

  const deltaColor = isPositive ? "var(--success)" : isNegative ? "var(--danger)" : "var(--text-secondary)";
  const deltaBg = isPositive ? "var(--success-soft)" : isNegative ? "var(--danger-soft)" : "var(--bg-hover)";
  const sparkColor = isPositive ? "var(--success)" : isNegative ? "var(--danger)" : "var(--accent)";

  return (
    <div
      className="card-shell animate-fade-up"
      style={{
        animationDelay: `${delay}ms`,
        opacity: 0,
        padding: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        transition: "border-color 150ms",
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)"}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}>
          {label}
        </span>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <Icon size={14} color="var(--text-secondary)" strokeWidth={1.8} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="tabular" style={{
            fontSize: 27,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: "var(--text-primary)",
            lineHeight: 1,
            fontFamily: "var(--font-mono)",
          }}>
            {fmt(value, format)}
          </div>
          {delta !== undefined && (
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginTop: 8,
              padding: "3px 8px",
              borderRadius: 999,
              background: deltaBg,
              fontSize: 11.5,
              fontWeight: 600,
              color: deltaColor,
            }}>
              {isPositive ? <TrendingUp size={11} /> : isNegative ? <TrendingDown size={11} /> : <Minus size={11} />}
              <span className="tabular">{formatPercent(delta)}</span>
            </div>
          )}
        </div>

        {sparkline && sparkline.length > 0 && (
          <SparkLine data={sparkline} color={sparkColor} width={72} height={32} />
        )}
      </div>
    </div>
  );
}
