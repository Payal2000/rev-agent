import {
  AlertTriangle,
  AlertCircle,
  Info,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
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
    low: "color-mix(in oklab, var(--success-soft) 44%, transparent)",
    medium: "color-mix(in oklab, var(--warning-soft) 44%, transparent)",
    high: "rgba(170, 124, 83, 0.13)",
    critical: "color-mix(in oklab, var(--danger-soft) 52%, transparent)",
  }[severity];

  const borderColor = {
    low: "color-mix(in oklab, var(--success) 24%, var(--border))",
    medium: "color-mix(in oklab, var(--warning) 26%, var(--border))",
    high: "rgba(170, 124, 83, 0.34)",
    critical: "color-mix(in oklab, var(--danger) 28%, var(--border))",
  }[severity];

  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: 12,
      padding: compact ? "10px 12px" : "14px 16px",
      display: "flex",
      gap: 10,
    }}>
      <div style={{ paddingTop: 2, flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", display: "block" }} className={dotCls} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div>
            <span style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: textCls,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}>
              <Icon size={11} />
              {metricLabel}
            </span>
            <p style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary)",
              margin: "3px 0 0",
              lineHeight: 1.35,
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
            fontSize: 12,
            color: "var(--text-secondary)",
            marginTop: 6,
            lineHeight: 1.55,
          }}>
            {explanation}
          </p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: compact ? 5 : 9, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: textCls,
            background: "rgba(255,255,255,0.12)",
            padding: "2px 7px",
            borderRadius: 6,
            border: `1px solid ${borderColor}`,
          }}>
            z={zScore.toFixed(1)} sigma
          </span>
          {affectedMrr !== undefined && (
            <span style={{ fontSize: 11, color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: 4 }}>
              {affectedMrr > 0 ? <TrendingDown size={12} color="var(--danger)" /> : <TrendingUp size={12} color="var(--success)" />}
              {formatCurrency(Math.abs(affectedMrr))} MRR
            </span>
          )}
          <span style={{
            fontSize: 10.5,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: textCls,
          }}>
            {severity}
          </span>
        </div>
      </div>
    </div>
  );
}
