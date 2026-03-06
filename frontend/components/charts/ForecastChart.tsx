"use client";

import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { FORECAST_DATA } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

type ForecastPoint = (typeof FORECAST_DATA)[number];

interface ForecastTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ForecastPoint }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: ForecastTooltipProps) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div style={{
      background: "var(--bg-elevated)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "10px 14px", fontSize: 12,
    }}>
      <p style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{label}</p>
      {d.actual != null && (
        <p style={{ color: "var(--accent)", margin: "2px 0", fontFamily: "var(--font-mono)" }}>
          Actual: {formatCurrency(d.actual, true)}
        </p>
      )}
      {d.p50 != null && (
        <>
          <p style={{ color: "var(--accent-ink)", margin: "2px 0", fontFamily: "var(--font-mono)" }}>
            P50: {formatCurrency(d.p50, true)}
          </p>
          <p style={{ color: "var(--text-muted)", margin: "2px 0", fontFamily: "var(--font-mono)", fontSize: 11 }}>
            80% CI: {formatCurrency(d.p80lo, true)} – {formatCurrency(d.p80hi, true)}
          </p>
          <p style={{ color: "var(--text-muted)", margin: "2px 0", fontFamily: "var(--font-mono)", fontSize: 11 }}>
            95% CI: {formatCurrency(d.p95lo, true)} – {formatCurrency(d.p95hi, true)}
          </p>
        </>
      )}
    </div>
  );
};

export default function ForecastChart() {
  // Build combined data where the transition point has both actual and p50
  const data = FORECAST_DATA.map((d, i) => {
    // At the boundary (last actual), carry the p50 as starting point for continuity
    if (i === 3) {
      return { ...d, p50: d.actual, p80lo: d.actual, p80hi: d.actual, p95lo: d.actual, p95hi: d.actual };
    }
    return d;
  });

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.22} />
            <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="p95Grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.08} />
            <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="p80Grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.15} />
            <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.04} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />

        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          axisLine={false} tickLine={false}
        />
        <YAxis
          tickFormatter={v => `$${(v / 1000).toFixed(0)}K`}
          tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
          axisLine={false} tickLine={false} width={52}
          domain={["auto", "auto"]}
        />

        <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--border)", strokeWidth: 1 }} />

        {/* Vertical reference line at forecast start */}
        <ReferenceLine x="Jan" stroke="var(--border)" strokeDasharray="4 2" label={{
          value: "Today",
          position: "top",
          fontSize: 10,
          fill: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
        }} />

        {/* 95% CI band */}
        <Area
          type="monotone" dataKey="p95hi"
          stroke="none" fill="url(#p95Grad)"
          connectNulls isAnimationActive={false}
        />
        <Area
          type="monotone" dataKey="p95lo"
          stroke="none" fill="var(--bg-surface)"
          connectNulls isAnimationActive={false}
        />

        {/* 80% CI band */}
        <Area
          type="monotone" dataKey="p80hi"
          stroke="none" fill="url(#p80Grad)"
          connectNulls isAnimationActive={false}
        />
        <Area
          type="monotone" dataKey="p80lo"
          stroke="none" fill="var(--bg-surface)"
          connectNulls isAnimationActive={false}
        />

        {/* Actual MRR area + line */}
        <Area
          type="monotone" dataKey="actual"
          stroke="var(--accent)" strokeWidth={2}
          fill="url(#actualGrad)"
          dot={{ fill: "var(--accent)", r: 3, strokeWidth: 0 }}
          connectNulls
        />

        {/* P50 forecast line */}
        <Line
          type="monotone" dataKey="p50"
          stroke="var(--accent)" strokeWidth={2}
          strokeDasharray="6 3"
          dot={{ fill: "var(--accent)", r: 3, strokeWidth: 0 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
