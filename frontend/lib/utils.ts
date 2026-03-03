// Number formatting utilities for financial data

export function formatCurrency(value: number, compact = false): string {
  if (compact) {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toLocaleString()}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function deltaColor(delta: number, inverse = false): string {
  const positive = inverse ? delta < 0 : delta > 0;
  if (positive) return "text-emerald-400";
  if (delta === 0) return "text-slate-400";
  return "text-rose-400";
}

export function deltaBgColor(delta: number, inverse = false): string {
  const positive = inverse ? delta < 0 : delta > 0;
  if (positive) return "bg-emerald-500/10 text-emerald-400";
  if (delta === 0) return "bg-slate-500/10 text-slate-400";
  return "bg-rose-500/10 text-rose-400";
}

export function severityColor(severity: "low" | "medium" | "high" | "critical"): string {
  return {
    low:      "text-emerald-400",
    medium:   "text-amber-400",
    high:     "text-orange-400",
    critical: "text-rose-400",
  }[severity];
}

export function severityDotColor(severity: "low" | "medium" | "high" | "critical"): string {
  return {
    low:      "bg-emerald-400",
    medium:   "bg-amber-400",
    high:     "bg-orange-400",
    critical: "bg-rose-400",
  }[severity];
}

export function agentColor(agent: string): string {
  const colors: Record<string, string> = {
    supervisor: "#8b5cf6",
    query:      "#0ea5e9",
    insights:   "#f59e0b",
    forecast:   "#10b981",
    action:     "#ef4444",
    validator:  "#6366f1",
  };
  return colors[agent.toLowerCase()] ?? "#7a94b8";
}

export function agentLabel(agent: string): string {
  const labels: Record<string, string> = {
    supervisor: "Supervisor",
    query:      "Query Agent",
    insights:   "Insights Agent",
    forecast:   "Forecast Agent",
    action:     "Action Agent",
    validator:  "Validator",
  };
  return labels[agent.toLowerCase()] ?? agent;
}
