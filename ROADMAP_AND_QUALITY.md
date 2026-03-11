# RevAgent — Roadmap & Agent Quality Guide

---

## Part 1: Future Plan in Action

### Current State (v1 — Complete)

| Feature | Status |
|---------|--------|
| 6-agent LangGraph pipeline | ✅ Done |
| Dashboard — KPI cards, MRR trends, tier breakdown, at-risk table | ✅ Done |
| Chat with SSE streaming, charts, approval cards | ✅ Done |
| Approvals page (human-in-the-loop) | ✅ Done |
| Anomaly detection + insights page | ✅ Done |
| Holt-Winters MRR forecasting | ✅ Done |
| RAG — schema, playbook, agent memory | ✅ Done |
| SQL safety + tenant isolation | ✅ Done |
| Audit logging | ✅ Done |
| Logo, UI polish, pastel design system | ✅ Done |

---

### Phase 2 — Answer Quality & Reliability (Next)

> Goal: Make the agents trustworthy enough for real business decisions.

| # | Task | Priority | Effort |
|---|------|----------|--------|
| 2.1 | Add system prompts to insights, forecast, validator agents | 🔴 High | Low |
| 2.2 | Add few-shot examples to action agent prompt | 🔴 High | Low |
| 2.3 | Add grounding constraints ("cite data only, no speculation") | 🔴 High | Low |
| 2.4 | Validator rubric — explicit 1–5 scoring definition, raise threshold 3.0 → 3.5 | 🔴 High | Low |
| 2.5 | Fix action agent playbook search bug (wrong context when no anomalies) | 🔴 High | Low |
| 2.6 | Validate recommendation impact estimates (cap at % of current MRR) | 🟡 Medium | Medium |
| 2.7 | Use query agent confidence score — add caveats when confidence < 0.6 | 🟡 Medium | Medium |
| 2.8 | RAG similarity threshold filter — ignore results below 0.5 cosine similarity | 🟡 Medium | Low |
| 2.9 | Allow disambiguation — let query agent ask clarifying questions | 🟡 Medium | Medium |
| 2.10 | Self-critique loop on action recommendations before surfacing to user | 🟢 Low | High |

---

### Phase 3 — Real Data & Integrations

> Goal: Connect to live data sources so the platform works with real company data.

| # | Task | Priority | Effort |
|---|------|----------|--------|
| 3.1 | Stripe webhook pipeline — ingest subscription events in real-time | 🔴 High | High |
| 3.2 | Stripe test-mode integration for demo with real API data | 🔴 High | Medium |
| 3.3 | Chargebee / Recurly adapter (same schema, pluggable source) | 🟡 Medium | High |
| 3.4 | CSV import — upload historical MRR/churn data from spreadsheets | 🟡 Medium | Medium |
| 3.5 | HubSpot CRM sync — pull customer health signals into agent context | 🟢 Low | High |
| 3.6 | Stale embedding detection — re-embed schema if DB schema changes | 🟡 Medium | Medium |

---

### Phase 4 — Action Execution

> Goal: Close the loop — approved recommendations actually do something.

| # | Task | Priority | Effort |
|---|------|----------|--------|
| 4.1 | Slack notification — send approved recommendations to Slack channel | 🔴 High | Low |
| 4.2 | Email draft generation — write retention email for at-risk customer | 🔴 High | Medium |
| 4.3 | HubSpot task creation — create follow-up task when churn risk detected | 🟡 Medium | Medium |
| 4.4 | Discount coupon trigger — auto-generate Stripe coupon for at-risk accounts | 🟡 Medium | High |
| 4.5 | Action outcome tracking — log result of each executed action to agent_memory | 🔴 High | Medium |
| 4.6 | Feedback loop — agent_memory updated with "did the action work?" after 30 days | 🟢 Low | High |

---

### Phase 5 — Proactive Intelligence

> Goal: System acts without being asked — detects and alerts automatically.

| # | Task | Priority | Effort |
|---|------|----------|--------|
| 5.1 | Celery beat anomaly scan — run detection hourly, push to notifications feed | 🔴 High | Medium |
| 5.2 | Notification center in UI — bell icon with unread anomaly alerts | 🔴 High | Medium |
| 5.3 | Slack alert webhook — push critical anomalies (z > 3.0) to Slack | 🟡 Medium | Low |
| 5.4 | Weekly digest email — summarize MRR, churn, top anomalies for the week | 🟡 Medium | Medium |
| 5.5 | Threshold configuration — user sets custom alert rules (e.g., MRR drops > 5%) | 🟢 Low | High |

---

### Phase 6 — Auth & Multi-Tenancy

> Goal: Make it a deployable SaaS product with real user accounts.

| # | Task | Priority | Effort |
|---|------|----------|--------|
| 6.1 | Clerk or NextAuth authentication — email/Google login | 🔴 High | Medium |
| 6.2 | Per-tenant data isolation — each company sees only their data | 🔴 High | Medium |
| 6.3 | Role-based access — Admin can approve actions, Viewer is read-only | 🟡 Medium | Medium |
| 6.4 | Tenant onboarding flow — connect data source, set company details | 🟡 Medium | High |
| 6.5 | Usage limits per plan — cap queries/month per tenant tier | 🟢 Low | Medium |

---

### Phase 7 — Reporting & Export

> Goal: Make insights shareable with stakeholders who don't use the app.

| # | Task | Priority | Effort |
|---|------|----------|--------|
| 7.1 | PDF export — download current insights/forecast page as PDF | 🟡 Medium | Medium |
| 7.2 | CSV export — download any data table (at-risk, tier breakdown, etc.) | 🟡 Medium | Low |
| 7.3 | Shareable dashboard link — public read-only view with expiry | 🟢 Low | High |
| 7.4 | Scheduled reports — auto-send PDF digest to stakeholders weekly | 🟢 Low | High |

---

### Phase 8 — Testing & Observability

> Goal: Make the system reliable and debuggable in production.

| # | Task | Priority | Effort |
|---|------|----------|--------|
| 8.1 | Agent unit tests — test each agent with fixed inputs and expected outputs | 🔴 High | High |
| 8.2 | SQL safety tests — regression suite for all injection patterns | 🔴 High | Medium |
| 8.3 | LangSmith tracing integration — trace every agent call with token usage | 🟡 Medium | Low |
| 8.4 | Sentry error tracking — frontend + backend error capture | 🟡 Medium | Low |
| 8.5 | Full audit log replay — store actual SQL + results (not just hashes) | 🟢 Low | Medium |

---

---

## Part 2: Techniques to Improve Agent Answer Quality

### The Core Problem

LLM agents fail in predictable ways: they speculate when they should stay grounded, they hallucinate numbers that sound plausible, they guess intent instead of asking for clarification, and they approve mediocre outputs because the quality bar is undefined. The techniques below address each failure mode directly.

---

### Technique 1 — Structured System Prompts (Role + Rules + Format)

Every LLM call needs three sections. Currently your insights, forecast, and validator agents have **no system prompt**.

```
ROLE:
You are a SaaS revenue analyst for RevAgent. You analyze metric anomalies
and explain them to non-technical business operators.

RULES:
- Base explanations ONLY on the data provided. Do not infer causes not in the data.
- If you are uncertain, state that explicitly ("the data suggests...").
- Never speculate about external factors (market conditions, competition, seasonality)
  unless supported by a trend in the numbers.
- Always include the specific metric name, value, and percentage change.

OUTPUT FORMAT:
2-3 sentences. Sentence 1: what happened and magnitude.
Sentence 2: most likely cause based on data. Sentence 3: business implication.
```

**Impact:** Prevents vague, speculative, and ungrounded explanations.

---

### Technique 2 — Chain-of-Thought Before Final Answer

Force the model to reason step by step before generating the final response:

```
Before writing your explanation, reason through:
1. What is the exact metric and how much did it change?
2. What does the z-score indicate about severity?
3. What does the query data suggest as a possible cause?
4. What is the business impact if left unaddressed?

Then write your 2-3 sentence explanation.
```

**Why it works:** Errors in intermediate reasoning become visible and self-correcting. The model is less likely to hallucinate when it has to show its work.

---

### Technique 3 — Grounding Constraints

Explicitly anchor the model to the data provided:

```
CRITICAL: Your explanation must reference specific numbers from the data above.
Do not add context, causes, or implications not directly supported by those numbers.
If the data is insufficient to explain the anomaly, say "The available data shows X
but does not indicate why — additional investigation is needed."
```

**Prevents:** Action agent saying "$500K MRR recovery" when current MRR is $80K.
**Prevents:** Forecast agent saying "sales team ramping" when there's no headcount data.

---

### Technique 4 — Few-Shot Examples in Prompts

The fastest way to align tone, specificity, and format without fine-tuning:

```
EXAMPLE — Good anomaly explanation:
"MRR dropped 8.2% week-over-week (z=2.4), with 3 enterprise accounts churning
totaling $12,000 — above the 90-day average of $4,200/week in churned MRR.
Immediate outreach to the remaining 5 enterprise accounts at risk is advised."

EXAMPLE — Bad explanation (do not write like this):
"Revenue declined due to possible market conditions or competitive pressure.
The company should consider improving its product offering."

Notice: Good examples cite numbers, z-scores, dollar values, and time periods.
Bad examples are vague, speculative, and not actionable.
```

---

### Technique 5 — LLM-as-Judge with an Explicit Rubric

Your validator agent scores answers 1–5 but the rubric is "be strict." Replace with:

```
Scoring Rubric:
5 — Directly answers the user's question using specific numbers from query results.
    Cites metric names, values, and time periods. No speculation.
4 — Correctly answers but lacks quantification, or qualifies uncertainty appropriately.
3 — Partially answers. Key metric is not addressed, or answer contains unverified claims.
2 — Vague or speculative. Not grounded in provided data. Significant gaps.
1 — Does not answer the question, contains factual errors, or could mislead the user.

Approve if score >= 3.5 AND no safety checks failed.
Reject if score < 3.5 OR any safety check failed.
```

**Also:** Show the validator the full answer, not just a 300-character truncation.

---

### Technique 6 — Confidence-Gated Caveats

Your query agent already returns a `confidence` score (0.0–1.0) but nothing downstream uses it. The fix:

```python
# In the final response aggregation:
if query_results.get("confidence", 1.0) < 0.6:
    caveat = "\n\n⚠️ Note: This query was generated with low confidence. " \
             "The results may not fully reflect your question — consider rephrasing."
    final_message += caveat
```

**Also:** Pass confidence to the validator as a signal. Low-confidence queries should score lower.

---

### Technique 7 — Output Schema Validation (Post-LLM)

After each structured LLM output, validate the numbers before passing downstream:

```python
# Action agent — validate impact estimates
current_mrr = state.get("query_results", {}).get("current_mrr", 0)
for rec in recommendations:
    impact_value = extract_dollar_value(rec["estimated_impact"])
    if impact_value and current_mrr and impact_value > current_mrr * 2:
        rec["estimated_impact"] = "Impact estimate unavailable — requires further analysis"
        rec["impact_flag"] = "estimate_exceeded_mrr"

# Insights agent — validate z-scores
for anomaly in anomalies:
    if abs(anomaly["z_score"]) > 10:
        anomaly["severity"] = "data_quality_issue"  # z=15 is likely a data error
```

**Catches:** Hallucinated "$2M recovery" on a $50K MRR company. Impossible z-scores from bad data.

---

### Technique 8 — Self-Critique Loop

After generating recommendations, run a second LLM pass to review them:

```python
critique_prompt = f"""
Review these recommendations for a SaaS company with current MRR of ${current_mrr:,.0f}:

{recommendations_formatted}

For each recommendation, check:
1. Is the estimated impact realistic (should not exceed 50% of current MRR in 30 days)?
2. Is the action specific and executable by a 2-person team?
3. Does it directly address the detected anomaly ({anomaly_summary})?

If any check fails, revise that recommendation. Return the corrected list.
"""
```

**Best for:** Action agent where recommendations directly influence business decisions.

---

### Technique 9 — RAG Quality Filtering

Currently top-5 results are passed to agents regardless of similarity score. Low-similarity context actively hurts answers — it's better to have no context than irrelevant context.

```python
# In vector_tools.py — add threshold filtering
def search_playbook(query: str, top_k: int = 5, min_similarity: float = 0.50):
    results = run_vector_search(query, top_k)
    filtered = [r for r in results if r["similarity"] >= min_similarity]

    if not filtered:
        return []  # Agent handles "no relevant playbook found" case explicitly
    return filtered
```

Then in the action agent prompt:
```
{f"Relevant playbook strategies:\n{playbook_context}" if playbook_context
 else "No relevant playbook strategies found. Generate recommendations from first principles based on the anomaly data."}
```

---

### Technique 10 — Memory-Augmented Context Across Agents

Currently only the action agent uses `agent_memory`. Insights and forecast agents miss relevant history.

```python
# In insights agent — retrieve past anomaly outcomes
memory = await search_agent_memory(
    f"anomaly {metric_name} {direction}",
    company_id=tenant_id,
    top_k=2
)
memory_context = ""
if memory:
    memory_context = "\n\nPast similar anomalies for this company:\n"
    for m in memory:
        memory_context += f"- {m['content_text'][:200]} | Outcome: {m.get('outcome', 'unknown')}\n"
```

**Result:** "The last time churned_count spiked above z=2.5 (March 2025), proactive outreach recovered 60% of at-risk ARR within 3 weeks."

---

### Summary Table

| Technique | Agents Affected | Effort | Quality Gain |
|-----------|----------------|--------|--------------|
| 1. Structured system prompts | Insights, Forecast, Validator | Low | High |
| 2. Chain-of-thought reasoning | Insights, Forecast, Action | Low | High |
| 3. Grounding constraints | All narrative agents | Low | High |
| 4. Few-shot examples | Action, Insights | Low | High |
| 5. LLM judge rubric | Validator | Low | Medium |
| 6. Confidence-gated caveats | Query → all downstream | Medium | Medium |
| 7. Output schema validation | Action, Insights | Medium | High |
| 8. Self-critique loop | Action | Medium | High |
| 9. RAG similarity threshold | Query, Action | Low | Medium |
| 10. Memory-augmented context | Insights, Forecast | Medium | Medium |

---

### Implementation Order

```
Week 1 (Quick wins — system prompts + grounding):
  → Techniques 1, 2, 3, 4, 5 across all agents

Week 2 (Structural fixes):
  → Technique 7 (output validation)
  → Technique 9 (RAG threshold)
  → Fix action agent playbook search bug

Week 3 (Advanced):
  → Technique 6 (confidence-gated caveats)
  → Technique 8 (self-critique loop)
  → Technique 10 (memory context in insights/forecast)
```

---

*Document version: March 2026 | RevAgent v1*
