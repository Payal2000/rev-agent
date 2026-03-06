"use client";

import {
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { MRR_TREND } from "@/lib/mock-data";

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean; payload?: {name: string; value: number; color: string}[]; label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--bg-elevated)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: "10px 14px",
      minWidth: 180,
    }}>
      <p style={{ fontSize: 11.5, color: "var(--text-secondary)", marginBottom: 6, fontWeight: 600 }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} style={{
          display: "flex", justifyContent: "space-between", gap: 16,
          fontSize: 12, marginBottom: 2,
        }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
            {p.value > 0 ? "+" : ""}{(p.value / 1000).toFixed(1)}K
          </span>
        </div>
      ))}
    </div>
  );
};

export default function MRRChart() {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={MRR_TREND} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="gradNew" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
            <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke="var(--border-subtle)" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => `$${(v / 1000).toFixed(0)}K`}
          width={48}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11.5, color: "var(--text-secondary)", paddingTop: 12 }}
          iconType="circle" iconSize={8}
        />
        <Bar dataKey="new"        name="New MRR"        fill="var(--accent)"  radius={[2,2,0,0]} maxBarSize={10} />
        <Bar dataKey="expansion"  name="Expansion"      fill="var(--success)"  radius={[2,2,0,0]} maxBarSize={10} />
        <Bar dataKey="contraction" name="Contraction"   fill="var(--warning)"  radius={[2,2,0,0]} maxBarSize={10} />
        <Bar dataKey="churned"    name="Churned"        fill="var(--danger)"  radius={[2,2,0,0]} maxBarSize={10} />
        <Area
          type="monotone" dataKey="total" name="Total MRR"
          stroke="var(--accent)" strokeWidth={2}
          fill="url(#gradNew)" dot={false}
          yAxisId={0}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
