/**
 * Reusable KPI pastel color palette.
 * Use `bg` for card background, `text` for accent text/values.
 * All backgrounds are soft pastels. Text values are mid-tone pastel-friendly.
 */
export const KPI_COLORS = {
  amber:  { bg: "#fdeece", text: "#d97706" },  // revenue, MRR
  blue:   { bg: "#dbeafe", text: "#60a5fa" },  // subscribers, users
  green:  { bg: "#d1fae5", text: "#34d399" },  // NRR, retention, growth
  purple: { bg: "#ede9fe", text: "#a78bfa" },  // churn, risk
  red:    { bg: "#fee2e2", text: "#ef4444" },  // critical alerts, churn rate
  orange: { bg: "#ffedd5", text: "#f97316" },  // warnings, contraction
  pink:   { bg: "#fce7f3", text: "#ec4899" },  // expansion MRR, upsell
  teal:   { bg: "#ccfbf1", text: "#14b8a6" },  // forecasts, projections
  sky:    { bg: "#e0f2fe", text: "#38bdf8" },  // ARR, annual metrics
  indigo: { bg: "#e0e7ff", text: "#6366f1" },  // confidence intervals
  rose:   { bg: "#ffe4e6", text: "#f43f5e" },  // payment failures
  brown:  { bg: "#fef3c7", text: "#d97706" },  // ARR concentration, tenure
  yellow: { bg: "#fef9c3", text: "#eab308" },  // highlights, estimates
  gray:   { bg: "#f1f5f9", text: "#94a3b8" },  // neutral, secondary metrics
} as const;

export type KpiColorKey = keyof typeof KPI_COLORS;
