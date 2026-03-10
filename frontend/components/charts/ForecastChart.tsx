"use client";

import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { FORECAST_DATA } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

export type ForecastPoint = {
  month: string;
  actual: number | null;
  p50: number | null;
  p80lo: number | null;
  p80hi: number | null;
  p95lo: number | null;
  p95hi: number | null;
};

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

// Distinct palette — actual (purple), forecast (indigo-blue), CI bands
const COLOR_ACTUAL  = "#7c6eaa";
const COLOR_P50     = "#4880d4";
const COLOR_CI80    = "#4880d4";
const COLOR_CI95    = "#4880d4";

export default function ForecastChart({ chartData }: { chartData?: ForecastPoint[] }) {
  const source = chartData ?? FORECAST_DATA;
  // Find the last point with an actual value to use as the transition boundary
  const lastActualIdx = source.reduce((acc, d, i) => (d.actual != null ? i : acc), -1);
  const todayMonth = lastActualIdx >= 0 ? source[lastActualIdx].month : undefined;

  // Build combined data where the transition point has both actual and p50
  const data = source.map((d, i) => {
    if (i === lastActualIdx) {
      return { ...d, p50: d.actual, p80lo: d.actual, p80hi: d.actual, p95lo: d.actual, p95hi: d.actual };
    }
    return d;
  });

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={COLOR_ACTUAL} stopOpacity={0.28} />
            <stop offset="95%" stopColor={COLOR_ACTUAL} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="p95Grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={COLOR_CI95} stopOpacity={0.10} />
            <stop offset="95%" stopColor={COLOR_CI95} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="p80Grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={COLOR_CI80} stopOpacity={0.22} />
            <stop offset="95%" stopColor={COLOR_CI80} stopOpacity={0.06} />
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

        {/* Vertical reference line at forecast start (dynamic) */}
        {todayMonth && (
          <ReferenceLine x={todayMonth} stroke="#a09bbf" strokeDasharray="4 2" label={{
            value: "Today",
            position: "top",
            fontSize: 10,
            fill: "#a09bbf",
            fontFamily: "var(--font-mono)",
          }} />
        )}

        {/* 95% CI band */}
        <Area
          type="monotone" dataKey="p95hi"
          stroke="none" fill="url(#p95Grad)"
          connectNulls isAnimationActive={false}
        />
        <Area
          type="monotone" dataKey="p95lo"
          stroke="none" fill="white"
          connectNulls isAnimationActive={false}
        />

        {/* 80% CI band */}
        <Area
          type="monotone" dataKey="p80hi"
          stroke={COLOR_CI80} strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.35}
          fill="url(#p80Grad)"
          connectNulls isAnimationActive={false}
        />
        <Area
          type="monotone" dataKey="p80lo"
          stroke={COLOR_CI80} strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.35}
          fill="white"
          connectNulls isAnimationActive={false}
        />

        {/* Actual MRR area + line */}
        <Area
          type="monotone" dataKey="actual"
          stroke={COLOR_ACTUAL} strokeWidth={2.5}
          fill="url(#actualGrad)"
          dot={{ fill: COLOR_ACTUAL, r: 3, strokeWidth: 0 }}
          connectNulls
        />

        {/* P50 forecast line — distinct blue, dashed */}
        <Line
          type="monotone" dataKey="p50"
          stroke={COLOR_P50} strokeWidth={2.5}
          strokeDasharray="7 4"
          dot={{ fill: COLOR_P50, r: 3, strokeWidth: 0 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
