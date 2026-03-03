import { SSEEvent } from "./api";

const MOCK_STEPS: { agent: string; label: string }[] = [
  { agent: "supervisor", label: "Classifying intent..." },
  { agent: "query", label: "Generating SQL and querying data..." },
  { agent: "insights", label: "Analyzing anomalies..." },
  { agent: "validator", label: "Validating outputs..." },
];

const MOCK_RESPONSES: Record<string, string> = {
  mrr: `**MRR by Plan Tier — March 2026**

| Tier       | MRR       | Subscribers | ARPU   |
|------------|-----------|-------------|--------|
| Enterprise | $42,300   | 22          | $1,923 |
| Growth     | $28,750   | 87          | $330   |
| Starter    | $9,100    | 186         | $49    |
| **Total**  | **$80,150** | **295**   | **$272** |

MRR is up **+4.2%** month-over-month, driven by Enterprise expansion revenue of $3,200.`,

  churn: `**Enterprise Churn Analysis — Last 30 Days**

23 Enterprise accounts canceled, a **42% spike** above the 90-day baseline (z-score: 2.8σ).

**Cancellation reasons:**
- Pricing sensitivity: 45% (10 accounts)
- Competitor switch: 30% (7 accounts)
- Reduced usage: 25% (6 accounts)

**Key finding:** 67% of churned accounts cited the January 15 pricing update. Enterprise churn MRR impact: **$21,600/month** ($259K ARR).

**Forecast:** If the current trend continues, 18 additional Enterprise accounts are at risk over the next 60 days, representing ~$240K ARR.

**Recommended actions pending approval:**
1. Offer 90-day pricing lock to 12 highest-risk accounts — estimated save: $130K ARR
2. Schedule executive pricing review for Enterprise tier
3. Deploy usage-based discounting for declining-engagement accounts — est. $50K ARR`,

  forecast: `**MRR Forecast — Next Quarter**

Based on 90-day historical trends using Holt-Winters exponential smoothing:

| Period   | Projected MRR | 80% CI               |
|----------|---------------|----------------------|
| 30 days  | $83,400       | $79,200 – $87,600   |
| 60 days  | $86,100       | $80,400 – $91,800   |
| 90 days  | $88,900       | $82,300 – $95,500   |

**Trend:** Improving (+1.7% MoM growth rate)

MRR is projected to grow 10.9% over the next quarter if Enterprise churn is contained. The primary risk factor is the pricing-driven churn spike detected in February — if unaddressed, the 90-day projection falls to $81,200 (95% CI: $74K–$88K).

**Business implication:** Containing Enterprise churn via the pricing lock playbook is the highest-leverage action to hit $90K MRR by June.`,

  payment: `**Payment Failure Analysis — Last 30 Days**

| Metric                  | Value  |
|-------------------------|--------|
| Total invoices          | 412    |
| Failed payments         | 14     |
| Failure rate            | **3.4%** |
| Recovered (retry)       | 8      |
| Net failed MRR          | $1,840 |

⚠️ Payment failure rate (**3.4%**) is above the 3% threshold (z-score: 1.8σ).

**Top failure reasons:** Expired cards (57%), insufficient funds (29%), bank declined (14%).

**Recommendation:** Activate smart retry logic with 3-attempt dunning over 7 days. Estimated recovery: $1,100 of the $1,840 at risk.`,

  default: `I analyzed your revenue data using the Query and Insights agents.

**Summary:** Current MRR is $80,150 across 295 active subscribers. No critical anomalies detected in the last 24 hours. All key metrics are within normal ranges.

For a deeper analysis, try asking:
- "Why did Enterprise churn spike last month?"
- "What will our MRR be next quarter?"
- "What is our MRR by plan tier?"`,
};

function getMockResponse(question: string): string {
  const q = question.toLowerCase();
  if (q.includes("mrr") || q.includes("revenue") || q.includes("tier")) return MOCK_RESPONSES.mrr;
  if (q.includes("churn") || q.includes("cancel") || q.includes("enterprise")) return MOCK_RESPONSES.churn;
  if (q.includes("forecast") || q.includes("next quarter") || q.includes("predict")) return MOCK_RESPONSES.forecast;
  if (q.includes("payment") || q.includes("fail") || q.includes("invoice")) return MOCK_RESPONSES.payment;
  return MOCK_RESPONSES.default;
}

export function streamMockResponse(
  question: string,
  onEvent: (event: SSEEvent) => void,
  onDone: () => void,
): void {
  const response = getMockResponse(question);
  const isChurn = question.toLowerCase().includes("churn") || question.toLowerCase().includes("enterprise");
  const stepCount = isChurn ? 4 : 2;

  // Emit all steps immediately with minimal stagger (150ms each)
  for (let i = 0; i < stepCount; i++) {
    setTimeout(() => onEvent({ type: "step", ...MOCK_STEPS[i] }), i * 150);
  }

  // Stream text in chunks of 4 words every 20ms — fast but still feels like streaming
  const words = response.split(" ");
  const chunkSize = 4;
  const startDelay = stepCount * 150 + 100;

  let chunkIndex = 0;
  for (let i = 0; i < words.length; i += chunkSize) {
    const chunk = words.slice(i, i + chunkSize).join(" ") + " ";
    setTimeout(() => onEvent({ type: "token", content: chunk }), startDelay + chunkIndex * 20);
    chunkIndex++;
  }

  const textDuration = startDelay + chunkIndex * 20;

  // Show approval card right after text finishes
  if (isChurn) {
    setTimeout(() => onEvent({
      type: "approval_required",
      session_id: "mock-session-" + Date.now(),
      context: {
        recommendations: [
          { rank: 1, title: "Offer 90-day pricing lock to 12 at-risk accounts", description: "Proactively reach out to the 12 highest-risk Enterprise accounts with a pricing lock offer at current rates for 12 months.", estimated_impact: "$130K ARR", category: "churn_reduction", requires_approval: true },
          { rank: 2, title: "Schedule executive pricing review", description: "Initiate a structured pricing review with VP Sales and Finance to evaluate Enterprise tier pricing.", estimated_impact: "Prevent $100K–$500K ARR at risk", category: "pricing", requires_approval: true },
          { rank: 3, title: "Usage-based discount for declining accounts", description: "Offer 20% discount to accounts with >30% usage decline over 60 days, tied to re-engagement.", estimated_impact: "$50K ARR", category: "churn_reduction", requires_approval: true },
        ],
        anomaly_summary: [{ metric: "churned_count", severity: "high", z_score: 2.8 }],
        forecast_summary: { projection_30d: 78400, trend: "declining" },
      },
    }), textDuration + 50);
  }

  setTimeout(() => { onEvent({ type: "done", session_id: "mock" } as SSEEvent); onDone(); }, textDuration + (isChurn ? 150 : 50));
}
