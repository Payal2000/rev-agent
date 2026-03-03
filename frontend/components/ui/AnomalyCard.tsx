import { AlertTriangle, TrendingUp, TrendingDown, AlertCircle, Info } from "lucide-react";
import { severityDotColor, severityColor, formatCurrency } from "@/lib/utils";

interface Props {
  id: string;
  title: string;
  explanation: string;
  severity: "low" | "medium" | "high" | "critical";
  metricLabel: string;
  zScore: number;
  timestamp: string;
  affectedMrr?: number;
  compact?: boolean;
}

const SEVERITY_ICON = {
  low:      Info,
  medium:   AlertCircle,
  high:     AlertTriangle,
  critical: AlertTriangle,
};

export default function AnomalyCard({
  title, explanation, severity, metricLabel, zScore, timestamp, affectedMrr, compact = false,
}: Props) {
  const dotCls = severityDotColor(severity);
  const textCls = severityColor(severity);
  const Icon = SEVERITY_ICON[severity];

  const bgColor = {
    low:      "rgba(16,185,129,0.05)",
    medium:   "rgba(245,158,11,0.05)",
    high:     "rgba(249,115,22,0.05)",
    critical: "rgba(244,63,94,0.06)",
  }[severity];

  const borderColor = {
    low:      "rgba(16,185,129,0.15)",
    medium:   "rgba(245,158,11,0.15)",
    high:     "rgba(249,115,22,0.15)",
    critical: "rgba(244,63,94,0.2)",
  }[severity];

  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: 10,
      padding: compact ? "10px 14px" : "14px 16px",
      display: "flex",
      gap: 10,
    }}>
      {/* Severity dot */}
      <div style={{ paddingTop: 2, flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", display: "block" }} className={dotCls} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div>
            <span style={{
              fontSize: 9.5, fontWeight: 600, letterSpacing: "0.08em",
              textTransform: "uppercase", color: textCls,
            }}>
              {metricLabel}
            </span>
            <p style={{
              fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
              margin: "2px 0 0", lineHeight: 1.35,
            }}>
              {title}
            </p>
          </div>
          <span style={{ fontSize: 10.5, color: "var(--text-muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
            {timestamp}
          </span>
        </div>

        {!compact && (
          <p style={{
            fontSize: 12, color: "var(--text-secondary)", marginTop: 5, lineHeight: 1.5,
          }}>
            {explanation}
          </p>
        )}

        {/* Meta row */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginTop: compact ? 4 : 8,
        }}>
          <span style={{
            fontSize: 11, fontFamily: "var(--font-mono)", color: textCls,
            background: `${borderColor}`,
            padding: "1px 6px", borderRadius: 4,
          }}>
            z={zScore.toFixed(1)}σ
          </span>
          {affectedMrr && (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {affectedMrr > 0 ? "↓" : "↑"} {formatCurrency(Math.abs(affectedMrr))} MRR
            </span>
          )}
          <span style={{
            fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
            color: textCls,
          }}>
            {severity}
          </span>
        </div>
      </div>
    </div>
  );
}
