// Complete mock data for RevAgent — coherent SaaS revenue story
// MRR: $423,800 | 1,284 subscribers | 2.1% churn | 108.4% NRR

export const METRICS_SUMMARY = {
  mrr: 423800,
  mrrPrev: 410500,
  mrrDelta: 3.2,
  arr: 5085600,
  subscribers: 1284,
  subscribersPrev: 1296,
  subscribersDelta: -12,
  nrr: 108.4,
  churnRate: 2.1,
  churnRatePrev: 1.8,
  arpu: 330,
  expansionMrr: 18200,
  newMrr: 22400,
  contractedMrr: 4100,
  churnedMrr: 14300,
};

// 12-month MRR trend (Feb 2025 – Jan 2026)
export const MRR_TREND = [
  { month: "Feb", new: 18200, expansion: 9100,  contraction: -2800, churned: -10200, total: 310000 },
  { month: "Mar", new: 19400, expansion: 10200, contraction: -2400, churned: -9800,  total: 322000 },
  { month: "Apr", new: 20100, expansion: 11000, contraction: -2100, churned: -9400,  total: 335000 },
  { month: "May", new: 21300, expansion: 12400, contraction: -3200, churned: -10100, total: 348000 },
  { month: "Jun", new: 22800, expansion: 13800, contraction: -2900, churned: -9600,  total: 362000 },
  { month: "Jul", new: 23400, expansion: 14200, contraction: -3600, churned: -11200, total: 374000 },
  { month: "Aug", new: 21800, expansion: 12800, contraction: -4200, churned: -12800, total: 369000 }, // dip
  { month: "Sep", new: 22600, expansion: 13400, contraction: -3100, churned: -10800, total: 378000 },
  { month: "Oct", new: 23900, expansion: 15100, contraction: -2800, churned: -9900,  total: 392000 },
  { month: "Nov", new: 25200, expansion: 16400, contraction: -3400, churned: -11200, total: 406000 },
  { month: "Dec", new: 24800, expansion: 17100, contraction: -3100, churned: -10800, total: 410500 },
  { month: "Jan", new: 22400, expansion: 18200, contraction: -4100, churned: -14300, total: 423800 },
];

// Tier breakdown
export const TIER_DATA = [
  { tier: "Starter",    mrr: 84760,  subscribers: 642, arpu: 132,  color: "#0ea5e9", pct: 20 },
  { tier: "Growth",     mrr: 190710, subscribers: 514, arpu: 371,  color: "#2563eb", pct: 45 },
  { tier: "Enterprise", mrr: 148330, subscribers: 128, arpu: 1159, color: "#22d3ee", pct: 35 },
];

// Anomaly events
export const ANOMALIES = [
  {
    id: "a1",
    metric: "enterprise_churn_count",
    metricLabel: "Enterprise Churn",
    title: "Enterprise churn spiked 42%",
    explanation: "23 Enterprise cancellations detected — 42% above the 90-day baseline of 16. Z-score: 2.8σ. Primary driver appears to be Q1 pricing update affecting accounts under $50K ARR.",
    severity: "critical" as const,
    zScore: 2.8,
    timestamp: "2 hours ago",
    affectedMrr: 21600,
  },
  {
    id: "a2",
    metric: "payment_failure_rate",
    metricLabel: "Payment Failures",
    title: "Payment failure rate at 3.4%",
    explanation: "14 of 412 invoices failed this month — above the 3% threshold. Top causes: expired cards (57%), insufficient funds (29%). Estimated unrecovered MRR: $1,840.",
    severity: "high" as const,
    zScore: 1.8,
    timestamp: "6 hours ago",
    affectedMrr: 1840,
  },
  {
    id: "a3",
    metric: "starter_expansion",
    metricLabel: "Starter → Growth Expansion",
    title: "Starter-to-Growth upgrades up 31%",
    explanation: "18 Starter accounts upgraded to Growth this month vs. 13.7 baseline. Positive signal aligned with the new onboarding flow launched in December.",
    severity: "low" as const,
    zScore: 1.4,
    timestamp: "1 day ago",
    affectedMrr: 2200,
  },
  {
    id: "a4",
    metric: "arpu_decline",
    metricLabel: "Growth ARPU",
    title: "Growth tier ARPU declined 4.2%",
    explanation: "ARPU in Growth tier dropped from $387 to $371 over 30 days. Likely driven by discount campaigns in November. Within 2σ but trending downward.",
    severity: "medium" as const,
    zScore: 1.2,
    timestamp: "2 days ago",
    affectedMrr: 7400,
  },
];

// Recent queries for dashboard table
export const RECENT_QUERIES = [
  { id: "q1", query: "Why did Enterprise churn spike last month?",         agent: "insights",  duration: "3.2s", timestamp: "10 min ago" },
  { id: "q2", query: "What is our MRR by plan tier this month?",          agent: "query",     duration: "1.8s", timestamp: "42 min ago" },
  { id: "q3", query: "Forecast next quarter's revenue",                   agent: "forecast",  duration: "4.1s", timestamp: "2 hours ago" },
  { id: "q4", query: "Which accounts are at risk of churning?",           agent: "insights",  duration: "5.3s", timestamp: "4 hours ago" },
  { id: "q5", query: "Show payment failure rate for the last 30 days",    agent: "query",     duration: "1.4s", timestamp: "Yesterday" },
];

// Forecast data
export const FORECAST_DATA = [
  // actuals
  { month: "Oct",  actual: 392000, p50: null, p80lo: null, p80hi: null, p95lo: null, p95hi: null },
  { month: "Nov",  actual: 406000, p50: null, p80lo: null, p80hi: null, p95lo: null, p95hi: null },
  { month: "Dec",  actual: 410500, p50: null, p80lo: null, p80hi: null, p95lo: null, p95hi: null },
  { month: "Jan",  actual: 423800, p50: null, p80lo: null, p80hi: null, p95lo: null, p95hi: null },
  // projections
  { month: "Feb",  actual: null,   p50: 434200, p80lo: 426800, p80hi: 441600, p95lo: 418400, p95hi: 450000 },
  { month: "Mar",  actual: null,   p50: 444800, p80lo: 433200, p80hi: 456400, p95lo: 421800, p95hi: 467800 },
  { month: "Apr",  actual: null,   p50: 456100, p80lo: 440200, p80hi: 472000, p95lo: 424600, p95hi: 487600 },
];

// Weekly AI digest
export const WEEKLY_DIGEST = {
  generatedAt: "Mar 5, 2026 · 9:00 AM",
  highlights: [
    { type: "info" as const,     title: "User Behavior Trends",  text: "Increased user engagement observed consistently during identified peak activity hours." },
    { type: "warning" as const,  title: "Risk & Anomaly Alerts", text: "AI detects unusual behavior patterns and alert teams for immediate review." },
    { type: "positive" as const, title: "Growth Suggestions",    text: "AI recommends actionable improvements to increase user engagement, retention, and overall growth." },
  ],
};

// Revenue signals
export const REVENUE_SIGNALS = [
  { label: "MRR Growth MoM",  value: "+$13.3K", delta: "+3.2%",       trend: "up" as const,      note: "Strongest since Sep 2025", colorKey: "amber"  },
  { label: "Expansion MRR",   value: "$18.2K",  delta: "+6.4%",       trend: "up" as const,      note: "All-time high",            colorKey: "pink"   },
  { label: "Contraction MRR", value: "$4.1K",   delta: "+32%",        trend: "down" as const,    note: "Spike from rollbacks",     colorKey: "orange" },
  { label: "ARR Concentration",value: "34%",    delta: "top 10 accts",trend: "neutral" as const, note: "Risk: moderate",           colorKey: "sky"    },
];

// Cohort retention (months since signup → retention %)
export const COHORT_RETENTION = [
  { cohort: "Aug 2025", m1: 94, m2: 88, m3: 82, m4: 76, m5: 71 },
  { cohort: "Sep 2025", m1: 96, m2: 90, m3: 85, m4: 79, m5: null },
  { cohort: "Oct 2025", m1: 95, m2: 89, m3: 83, m4: null, m5: null },
  { cohort: "Nov 2025", m1: 97, m2: 91, m3: null, m4: null, m5: null },
  { cohort: "Dec 2025", m1: 98, m2: null, m3: null, m4: null, m5: null },
];

// Early churn signals
export const CHURN_SIGNALS = [
  { signal: "Login frequency drop >50%", accounts: 14, mrrAtRisk: 18400, severity: "critical" as const },
  { signal: "No activity in 14+ days", accounts: 22, mrrAtRisk: 12600, severity: "high" as const },
  { signal: "Support tickets spike", accounts: 9, mrrAtRisk: 8200, severity: "high" as const },
  { signal: "Feature usage below baseline", accounts: 31, mrrAtRisk: 21000, severity: "medium" as const },
  { signal: "Contract renewal within 30d", accounts: 7, mrrAtRisk: 29400, severity: "medium" as const },
];

// Growth / upsell opportunities
export const GROWTH_OPPORTUNITIES = [
  { id: "g1", name: "Apex Ventures", tier: "Growth", mrr: 890, signal: "API usage at 94% of limit", potential: "+$560/mo", readiness: 92 },
  { id: "g2", name: "Kestrel Media", tier: "Starter", mrr: 149, signal: "5 team invites sent this week", potential: "+$222/mo", readiness: 87 },
  { id: "g3", name: "Orion Fintech", tier: "Growth", mrr: 740, signal: "Exported 12 reports in 30d", potential: "+$420/mo", readiness: 81 },
  { id: "g4", name: "Solaris Health", tier: "Starter", mrr: 149, signal: "Daily active usage for 28/30 days", potential: "+$222/mo", readiness: 76 },
  { id: "g5", name: "Nimbus Cloud", tier: "Growth", mrr: 890, signal: "Requested Enterprise feature 3x", potential: "+$270/mo", readiness: 71 },
];

// Segment health
export const SEGMENT_HEALTH = [
  { tier: "Enterprise", health: 64, accounts: 128, mrr: 148330, churnRate: 4.1, nrr: 112, trend: "down" as const, color: "#6c5ce7" },
  { tier: "Growth",     health: 78, accounts: 514, mrr: 190710, churnRate: 1.8, nrr: 110, trend: "stable" as const, color: "#0ea5e9" },
  { tier: "Starter",    health: 85, accounts: 642, mrr: 84760,  churnRate: 1.2, nrr: 104, trend: "up" as const, color: "#10b981" },
];

// Operational alerts
export const OPERATIONAL_ALERTS = [
  { id: "o1", label: "Failed payments",       value: "14 invoices", sub: "$1,840 MRR at risk",      status: "critical" as const },
  { id: "o2", label: "Expired cards",         value: "8 accounts",  sub: "Auto-retry scheduled",    status: "warning" as const },
  { id: "o3", label: "Trial-to-paid drop",    value: "18.4% CVR",   sub: "Down from 22.1% last mo", status: "warning" as const },
  { id: "o4", label: "Dunning in progress",   value: "6 accounts",  sub: "$3,120 recoverable MRR",  status: "info" as const },
];

// At-risk accounts
export const AT_RISK_ACCOUNTS = [
  { id: "acc1", name: "Meridian Analytics",    tier: "Enterprise", mrr: 4200, riskScore: 94, daysToChurn: 12, signals: ["Usage -68%", "No login 21d"] },
  { id: "acc2", name: "Vortex Payments",       tier: "Enterprise", mrr: 3800, riskScore: 87, daysToChurn: 18, signals: ["Support ticket", "Contract renewal due"] },
  { id: "acc3", name: "Clearfield SaaS",       tier: "Enterprise", mrr: 2900, riskScore: 79, daysToChurn: 24, signals: ["Usage -41%", "Pricing objection"] },
  { id: "acc4", name: "Northgate Logistics",   tier: "Growth",     mrr: 890,  riskScore: 72, daysToChurn: 31, signals: ["3 failed payments"] },
  { id: "acc5", name: "Delphi Research Group", tier: "Growth",     mrr: 740,  riskScore: 65, daysToChurn: 38, signals: ["Usage -29%"] },
];
