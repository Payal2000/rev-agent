"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { TIER_DATA } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

const CustomTooltip = ({ active, payload }: {active?: boolean; payload?: {payload: typeof TIER_DATA[0]}[]}) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: "#0d1420", border: "1px solid #1e2b42",
      borderRadius: 8, padding: "8px 12px",
    }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: d.color, marginBottom: 2 }}>{d.tier}</p>
      <p style={{ fontSize: 11.5, color: "#e2e8f4", fontFamily: "var(--font-mono)" }}>
        {formatCurrency(d.mrr)} MRR
      </p>
      <p style={{ fontSize: 11, color: "#7a94b8" }}>{d.subscribers} subscribers</p>
    </div>
  );
};

export default function TierChart() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      {/* Donut */}
      <div style={{ width: 120, height: 120, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={TIER_DATA}
              cx="50%" cy="50%"
              innerRadius={34} outerRadius={52}
              dataKey="mrr"
              stroke="none"
              paddingAngle={2}
            >
              {TIER_DATA.map((entry) => (
                <Cell key={entry.tier} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        {TIER_DATA.map(d => (
          <div key={d.tier} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{d.tier}</span>
                <span style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                  {formatCurrency(d.mrr, true)}
                </span>
              </div>
              {/* Progress bar */}
              <div style={{
                height: 3, borderRadius: 2,
                background: "var(--bg-elevated)", marginTop: 3, overflow: "hidden",
              }}>
                <div style={{
                  width: `${d.pct}%`, height: "100%",
                  background: d.color, borderRadius: 2,
                  transition: "width 600ms ease",
                }} />
              </div>
            </div>
            <span style={{ fontSize: 10.5, color: "var(--text-muted)", width: 28, textAlign: "right" }}>
              {d.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
