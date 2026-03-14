import { AlertTriangle, AlertCircle, Info, TrendingDown, TrendingUp, ArrowRight } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { KPI_COLORS } from "@/lib/kpi-colors";

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

const SEV_CFG = {
  critical: { ...KPI_COLORS.red,    Icon: AlertTriangle },
  high:     { ...KPI_COLORS.orange, Icon: AlertTriangle },
  medium:   { ...KPI_COLORS.yellow, Icon: AlertCircle   },
  low:      { ...KPI_COLORS.green,  Icon: Info          },
};

export default function AnomalyCard({
  title, explanation, severity, metricLabel, zScore, timestamp, affectedMrr, compact = false,
}: Props) {
  const s = SEV_CFG[severity];
  const { Icon } = s;
  const chatQuery = `Investigate anomaly: ${title}. Metric: ${metricLabel}. ${explanation}`;
  const chatHref = `/chat?new=1&q=${encodeURIComponent(chatQuery)}`;

  return (
    <div style={{ padding: "14px 16px", borderRadius: 14, background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      {/* Header: icon + title + timestamp */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{
          width: 34, height: 34, borderRadius: "50%",
          background: s.bg, border: `1.5px solid ${s.text}22`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Icon size={15} color={s.text} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", margin: 0, lineHeight: 1.3 }}>{title}</p>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: s.text }}>
            {metricLabel}
          </span>
        </div>
        <span style={{ fontSize: 10.5, color: "var(--text-muted)", whiteSpace: "nowrap", flexShrink: 0 }}>{timestamp}</span>
      </div>

      {/* Explanation */}
      {!compact && (
        <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "0 0 10px", lineHeight: 1.6 }}>
          {explanation}
        </p>
      )}

      {/* Footer: badges + link */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
          background: s.text, color: severity === "medium" || severity === "low" ? "#1a1a1a" : "white",
          letterSpacing: "0.06em", textTransform: "uppercase" as const,
        }}>
          {severity}
        </span>
        <span style={{
          fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 400,
          color: "var(--text-muted)", padding: "2px 0",
        }}>
          z={zScore.toFixed(1)}σ
        </span>
        {affectedMrr !== undefined && (
          <span style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {affectedMrr > 0
              ? <TrendingDown size={11} color={s.text} />
              : <TrendingUp size={11} color={KPI_COLORS.green.text} />}
            {formatCurrency(Math.abs(affectedMrr))} MRR
          </span>
        )}
        <Link
          href={chatHref}
          onClick={(e) => {
            e.preventDefault();
            window.location.assign(`${chatHref}&run=${Date.now()}`);
          }}
          style={{ fontSize: 12.5, fontWeight: 400, color: "var(--text-primary)", textDecoration: "none", marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          Investigate in Chat <ArrowRight size={11} />
        </Link>
      </div>
    </div>
  );
}
