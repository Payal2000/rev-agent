"use client";

import { Check } from "lucide-react";
import { agentColor, agentLabel } from "@/lib/utils";

interface Step {
  agent: string;
  label: string;
  status: "pending" | "active" | "complete";
}

interface Props {
  steps: { agent: string; label: string }[];
  activeIndex?: number;
}

export default function StreamingSteps({ steps, activeIndex }: Props) {
  if (steps.length === 0) return null;

  const enriched: Step[] = steps.map((s, i) => ({
    ...s,
    status: activeIndex === undefined
      ? "complete"
      : i < activeIndex
        ? "complete"
        : i === activeIndex
          ? "active"
          : "pending",
  }));

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 4,
      padding: "10px 14px",
      background: "var(--bg-elevated)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      marginBottom: 6,
    }}>
      {enriched.map((step, i) => {
        const color = agentColor(step.agent);
        const isComplete = step.status === "complete";
        const isActive = step.status === "active";

        return (
          <div
            key={i}
            className="animate-slide-in"
            style={{
              animationDelay: `${i * 60}ms`,
              opacity: 0,
              display: "flex",
              alignItems: "center",
              gap: 9,
            }}
          >
            {/* Status indicator */}
            <div style={{
              width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: isComplete ? `${color}20` : isActive ? `${color}15` : "var(--bg-hover)",
              border: `1.5px solid ${isComplete ? color : isActive ? color : "var(--border)"}`,
              transition: "all 200ms",
            }}>
              {isComplete && <Check size={9} color={color} strokeWidth={3} />}
              {isActive && (
                <span
                  className="animate-pulse-dot"
                  style={{ width: 6, height: 6, borderRadius: "50%", background: color }}
                />
              )}
            </div>

            {/* Label */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
              <span style={{
                fontSize: 10.5, fontWeight: 600,
                padding: "1px 6px", borderRadius: 10,
                background: `${color}15`,
                color: color,
                letterSpacing: "0.01em",
              }}>
                {agentLabel(step.agent)}
              </span>
              <span style={{
                fontSize: 12,
                color: isActive ? "var(--text-secondary)" : isComplete ? "var(--text-muted)" : "var(--text-muted)",
              }}>
                {step.label}
              </span>
            </div>

            {isComplete && (
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>✓</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
