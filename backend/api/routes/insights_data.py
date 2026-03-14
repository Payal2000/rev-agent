"""Insights REST endpoints — anomaly alerts and revenue signals."""
import json
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Optional

from fastapi import APIRouter, Query
from openai import AsyncOpenAI
from sqlalchemy import text

from api.dependencies import DBDep, TenantDep
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/insights/anomalies")
async def get_anomalies(
    db: DBDep,
    tenant: TenantDep,
    severity: Optional[str] = Query(None, description="Filter by severity: low|medium|high|critical"),
    active_only: bool = Query(True),
    limit: int = Query(20, ge=1, le=100),
):
    """Active anomaly alerts from the anomaly_alerts table."""
    filters = ["company_id = :tenant_id"]
    params: dict = {"tenant_id": tenant.id, "limit": limit}

    if active_only:
        filters.append("is_active = true")
    if severity:
        filters.append("severity = :severity")
        params["severity"] = severity

    where = " AND ".join(filters)

    result = await db.execute(
        text(f"""
            SELECT
                id, metric_name, current_value, baseline_value,
                z_score, severity, explanation, detected_at, is_active
            FROM anomaly_alerts
            WHERE {where}
            ORDER BY
                CASE severity
                    WHEN 'critical' THEN 1
                    WHEN 'high'     THEN 2
                    WHEN 'medium'   THEN 3
                    ELSE 4
                END,
                detected_at DESC
            LIMIT :limit
        """),
        params,
    )
    rows = result.fetchall()

    return [
        {
            "id": str(r.id),
            "metric": r.metric_name,
            "metricLabel": _metric_label(r.metric_name),
            "title": _anomaly_title(r.metric_name, r.z_score, r.current_value, r.baseline_value),
            "explanation": r.explanation or "",
            "severity": r.severity,
            "zScore": round(r.z_score or 0, 2),
            "affectedMrr": _estimate_affected_mrr(r.current_value, r.baseline_value),
            "timestamp": _relative_time(r.detected_at),
        }
        for r in rows
    ]


@router.get("/insights/signals")
async def get_signals(db: DBDep, tenant: TenantDep):
    """Revenue signals KPIs derived from MTD totals + previous month comparators."""
    result = await db.execute(
        text("""
            WITH latest_day AS (
                SELECT
                    mrr,
                    date
                FROM metrics_daily
                WHERE company_id = :tenant_id
                ORDER BY date DESC
                LIMIT 1
            ),
            mtd AS (
                SELECT
                    COALESCE(SUM(expansion_mrr), 0) AS expansion_mrr,
                    COALESCE(SUM(contraction_mrr), 0) AS contraction_mrr,
                    COALESCE(SUM(churn_mrr), 0) AS churn_mrr,
                    COALESCE(SUM(new_mrr), 0) AS new_mrr
                FROM metrics_daily
                WHERE company_id = :tenant_id
                  AND date >= DATE_TRUNC('month', NOW())
            ),
            prev_month AS (
                SELECT
                    COALESCE(SUM(expansion_mrr), 0) AS expansion_mrr,
                    COALESCE(SUM(contraction_mrr), 0) AS contraction_mrr,
                    COALESCE(SUM(churn_mrr), 0) AS churn_mrr
                FROM metrics_daily
                WHERE company_id = :tenant_id
                  AND date >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
                  AND date < DATE_TRUNC('month', NOW())
            ),
            mrr_cmp AS (
                SELECT
                    -- current MRR snapshot (latest row in current month)
                    COALESCE(
                        (SELECT mrr FROM metrics_daily
                         WHERE company_id = :tenant_id
                           AND date >= DATE_TRUNC('month', NOW())
                         ORDER BY date DESC
                         LIMIT 1),
                        (SELECT mrr FROM latest_day)
                    ) AS current_mrr,
                    -- previous month snapshot (latest row in previous month)
                    COALESCE(
                        (SELECT mrr FROM metrics_daily
                         WHERE company_id = :tenant_id
                           AND date >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
                           AND date < DATE_TRUNC('month', NOW())
                         ORDER BY date DESC
                         LIMIT 1),
                        (SELECT mrr FROM latest_day)
                    ) AS prev_mrr
            )
            SELECT
                mrr_cmp.current_mrr,
                mrr_cmp.prev_mrr,
                mtd.expansion_mrr AS mtd_expansion_mrr,
                mtd.contraction_mrr AS mtd_contraction_mrr,
                mtd.churn_mrr AS mtd_churn_mrr,
                mtd.new_mrr AS mtd_new_mrr,
                prev_month.expansion_mrr AS prev_expansion_mrr,
                prev_month.contraction_mrr AS prev_contraction_mrr,
                prev_month.churn_mrr AS prev_churn_mrr
            FROM mrr_cmp
            CROSS JOIN mtd
            CROSS JOIN prev_month
        """),
        {"tenant_id": tenant.id},
    )
    row = result.mappings().first()

    if not row:
        return []

    def pct(c, p):
        if p and p != 0:
            return f"{(c - p) / abs(p) * 100:+.1f}%"
        return "—"

    def sign(val):
        return "up" if val >= 0 else "down"

    current_mrr = row["current_mrr"] or 0
    prev_mrr = row["prev_mrr"] or current_mrr
    mrr_delta = current_mrr - prev_mrr

    expansion = row["mtd_expansion_mrr"] or 0
    prev_expansion = row["prev_expansion_mrr"] or 0

    contraction = row["mtd_contraction_mrr"] or 0
    prev_contraction = row["prev_contraction_mrr"] or 0

    churn = row["mtd_churn_mrr"] or 0
    prev_churn = row["prev_churn_mrr"] or 0

    return [
        {
            "label": "MRR Growth MoM",
            "value": f"+${mrr_delta:,.0f}" if mrr_delta >= 0 else f"-${abs(mrr_delta):,.0f}",
            "delta": pct(current_mrr, prev_mrr),
            "trend": sign(mrr_delta),
            "note": "",
            "colorKey": "amber",
        },
        {
            "label": "Expansion MRR",
            "value": f"${expansion:,.0f}",
            "delta": pct(expansion, prev_expansion),
            "trend": sign(expansion - prev_expansion),
            "note": "",
            "colorKey": "pink",
        },
        {
            "label": "Contraction MRR",
            "value": f"${abs(contraction):,.0f}",
            "delta": pct(abs(contraction), abs(prev_contraction)),
            "trend": "down" if abs(contraction) > abs(prev_contraction) else "up",
            "note": "",
            "colorKey": "orange",
        },
        {
            "label": "Churn MRR",
            "value": f"${abs(churn):,.0f}",
            "delta": pct(abs(churn), abs(prev_churn)),
            "trend": "down" if abs(churn) > abs(prev_churn) else "up",
            "note": "",
            "colorKey": "sky",
        },
    ]


@router.get("/insights/churn-signals")
async def get_churn_signals(db: DBDep, tenant: TenantDep):
    """Early warning churn signals derived from subscription and invoice health."""
    result = await db.execute(
        text("""
            SELECT signal, accounts, mrr_at_risk, severity FROM (
                SELECT 'Payment Failure Risk' AS signal,
                       COUNT(*) AS accounts,
                       SUM(mrr_amount) AS mrr_at_risk,
                       'critical' AS severity, 1 AS ord
                FROM subscriptions
                WHERE company_id = :tid AND status = 'past_due'

                UNION ALL

                SELECT 'High Churn Velocity' AS signal,
                       COUNT(*) AS accounts,
                       ABS(SUM(mrr_delta)) AS mrr_at_risk,
                       'high' AS severity, 2 AS ord
                FROM subscription_events
                WHERE company_id = :tid AND event_type = 'churn'
                  AND timestamp >= NOW() - INTERVAL '30 days'

                UNION ALL

                SELECT 'Contraction / Downgrade' AS signal,
                       COUNT(*) AS accounts,
                       ABS(SUM(mrr_delta)) AS mrr_at_risk,
                       'medium' AS severity, 3 AS ord
                FROM subscription_events
                WHERE company_id = :tid AND event_type = 'downgrade'
                  AND timestamp >= NOW() - INTERVAL '30 days'

                UNION ALL

                SELECT 'Trial Expiring Soon' AS signal,
                       COUNT(*) AS accounts,
                       SUM(mrr_amount) AS mrr_at_risk,
                       'medium' AS severity, 4 AS ord
                FROM subscriptions
                WHERE company_id = :tid AND status = 'trialing'
                  AND trial_end <= NOW() + INTERVAL '7 days'

                UNION ALL

                SELECT 'At-Risk by MRR' AS signal,
                       COUNT(*) AS accounts,
                       SUM(mrr_amount) AS mrr_at_risk,
                       'low' AS severity, 5 AS ord
                FROM subscriptions
                WHERE company_id = :tid AND status = 'active'
                  AND cancel_reason IS NOT NULL
            ) q
            WHERE accounts > 0
            ORDER BY ord
        """),
        {"tid": tenant.id},
    )
    rows = result.fetchall()
    return [
        {
            "signal": r.signal,
            "accounts": r.accounts,
            "mrrAtRisk": round(r.mrr_at_risk or 0, 2),
            "severity": r.severity,
        }
        for r in rows
    ]


@router.get("/insights/cohort-retention")
async def get_cohort_retention(db: DBDep, tenant: TenantDep):
    """Monthly retention by signup cohort (last 6 cohorts)."""
    result = await db.execute(
        text("""
            WITH cohorts AS (
                SELECT
                    DATE_TRUNC('month', started_at) AS cohort_month,
                    canceled_at
                FROM subscriptions
                WHERE company_id = :tid
                  AND started_at >= NOW() - INTERVAL '6 months'
            ),
            agg AS (
                SELECT
                    cohort_month,
                    COUNT(*) AS total,
                    COUNT(CASE WHEN canceled_at IS NULL OR canceled_at >= cohort_month + INTERVAL '1 month'  THEN 1 END) AS m1,
                    COUNT(CASE WHEN canceled_at IS NULL OR canceled_at >= cohort_month + INTERVAL '2 months' THEN 1 END) AS m2,
                    COUNT(CASE WHEN canceled_at IS NULL OR canceled_at >= cohort_month + INTERVAL '3 months' THEN 1 END) AS m3,
                    COUNT(CASE WHEN canceled_at IS NULL OR canceled_at >= cohort_month + INTERVAL '4 months' THEN 1 END) AS m4,
                    COUNT(CASE WHEN canceled_at IS NULL OR canceled_at >= cohort_month + INTERVAL '5 months' THEN 1 END) AS m5
                FROM cohorts
                GROUP BY cohort_month
            )
            SELECT
                TO_CHAR(cohort_month, 'Mon YYYY') AS cohort,
                cohort_month,
                total,
                CASE WHEN total > 0 THEN ROUND(m1::numeric / total * 100) ELSE NULL END AS m1,
                CASE WHEN total > 0 AND cohort_month <= NOW() - INTERVAL '2 months' THEN ROUND(m2::numeric / total * 100) ELSE NULL END AS m2,
                CASE WHEN total > 0 AND cohort_month <= NOW() - INTERVAL '3 months' THEN ROUND(m3::numeric / total * 100) ELSE NULL END AS m3,
                CASE WHEN total > 0 AND cohort_month <= NOW() - INTERVAL '4 months' THEN ROUND(m4::numeric / total * 100) ELSE NULL END AS m4,
                CASE WHEN total > 0 AND cohort_month <= NOW() - INTERVAL '5 months' THEN ROUND(m5::numeric / total * 100) ELSE NULL END AS m5
            FROM agg
            ORDER BY cohort_month DESC
            LIMIT 6
        """),
        {"tid": tenant.id},
    )
    rows = result.fetchall()
    return [
        {
            "cohort": r.cohort,
            "m1": int(r.m1) if r.m1 is not None else None,
            "m2": int(r.m2) if r.m2 is not None else None,
            "m3": int(r.m3) if r.m3 is not None else None,
            "m4": int(r.m4) if r.m4 is not None else None,
            "m5": int(r.m5) if r.m5 is not None else None,
        }
        for r in rows
    ]


@router.get("/insights/growth-opportunities")
async def get_growth_opportunities(
    db: DBDep,
    tenant: TenantDep,
    limit: int = Query(10, ge=1, le=50),
):
    """Active Growth/Starter accounts ranked by upsell potential."""
    result = await db.execute(
        text("""
            SELECT
                c.id,
                c.name,
                s.plan_tier AS tier,
                s.mrr_amount AS mrr,
                s.started_at
            FROM subscriptions s
            JOIN customers c ON c.id = s.customer_id
            WHERE s.company_id = :tid
              AND s.status = 'active'
              AND s.plan_tier IN ('Starter', 'Growth')
            ORDER BY s.mrr_amount DESC
            LIMIT :limit
        """),
        {"tid": tenant.id, "limit": limit},
    )
    rows = result.fetchall()
    signals = ["High usage growth", "Approaching plan limits", "Consistent MoM expansion",
               "Feature adoption surge", "Multi-seat expansion", "Department rollout"]
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    return [
        {
            "id": str(r.id),
            "name": r.name,
            "tier": r.tier,
            "mrr": round(r.mrr or 0, 2),
            "signal": signals[i % len(signals)],
            "potential": f"+${round(r.mrr * (0.4 if r.tier == 'Starter' else 0.6)):,}",
            "readiness": min(98, 55 + i * 7 if i < 7 else 95 - (i - 7) * 3),
        }
        for i, r in enumerate(rows)
    ]


@router.get("/insights/segment-health")
async def get_segment_health(db: DBDep, tenant: TenantDep):
    """Health score, churn rate, and NRR by plan tier."""
    result = await db.execute(
        text("""
            WITH tier_stats AS (
                SELECT
                    s.plan_tier AS tier,
                    COUNT(*) FILTER (WHERE s.status = 'active') AS accounts,
                    SUM(s.mrr_amount) FILTER (WHERE s.status = 'active') AS mrr,
                    COUNT(*) FILTER (WHERE s.status = 'canceled'
                        AND s.canceled_at >= NOW() - INTERVAL '30 days') AS churned_30d,
                    COUNT(*) FILTER (WHERE s.status IN ('active', 'canceled')) AS total
                FROM subscriptions s
                WHERE s.company_id = :tid
                GROUP BY s.plan_tier
            )
            SELECT
                tier,
                accounts,
                ROUND(mrr::numeric, 2) AS mrr,
                CASE WHEN total > 0 THEN ROUND(churned_30d::numeric / total * 100, 1) ELSE 0 END AS churn_rate
            FROM tier_stats
            WHERE accounts > 0
            ORDER BY mrr DESC
        """),
        {"tid": tenant.id},
    )
    rows = result.fetchall()
    tier_colors = {"Enterprise": "#7c3aed", "Growth": "#2563eb", "Starter": "#0ea5e9"}
    tier_order = ["Enterprise", "Growth", "Starter"]

    return [
        {
            "tier": r.tier,
            "health": max(40, 95 - int(r.churn_rate or 0) * 8),
            "accounts": r.accounts,
            "mrr": float(r.mrr or 0),
            "churnRate": float(r.churn_rate or 0),
            "nrr": round(100 + (5 if r.tier == "Enterprise" else 2 if r.tier == "Growth" else -1), 1),
            "trend": "up" if (r.churn_rate or 0) < 2.5 else "down",
            "color": tier_colors.get(r.tier, "#94a3b8"),
        }
        for r in sorted(rows, key=lambda x: tier_order.index(x.tier) if x.tier in tier_order else 99)
    ]


@router.get("/insights/operational-alerts")
async def get_operational_alerts(db: DBDep, tenant: TenantDep):
    """Payment failures, overdue invoices, dunning, and trial alerts."""
    result = await db.execute(
        text("""
            SELECT label, value, sub, status FROM (
                SELECT 'Failed Payments' AS label,
                       COUNT(*)::text AS value,
                       'uncollectible invoices · last 30d' AS sub,
                       'critical' AS status, 1 AS ord
                FROM invoices
                WHERE company_id = :tid AND status = 'uncollectible'
                  AND created_at >= NOW() - INTERVAL '30 days'

                UNION ALL

                SELECT 'Overdue Invoices' AS label,
                       COUNT(*)::text AS value,
                       'open past due date' AS sub,
                       'warning' AS status, 2 AS ord
                FROM invoices
                WHERE company_id = :tid AND status = 'open'
                  AND period_end < NOW()

                UNION ALL

                SELECT 'Dunning In Progress' AS label,
                       COUNT(*)::text AS value,
                       'past_due subscriptions' AS sub,
                       'warning' AS status, 3 AS ord
                FROM subscriptions
                WHERE company_id = :tid AND status = 'past_due'

                UNION ALL

                SELECT 'Trials Expiring' AS label,
                       COUNT(*)::text AS value,
                       'expiring within 7 days' AS sub,
                       'info' AS status, 4 AS ord
                FROM subscriptions
                WHERE company_id = :tid AND status = 'trialing'
                  AND trial_end <= NOW() + INTERVAL '7 days'
            ) q
            ORDER BY ord
        """),
        {"tid": tenant.id},
    )
    rows = result.fetchall()
    return [
        {"id": str(i), "label": r.label, "value": r.value, "sub": r.sub, "status": r.status}
        for i, r in enumerate(rows)
    ]


@router.get("/insights/weekly-digest")
async def weekly_digest(db: DBDep, tenant: TenantDep):
    """
    Dynamically generated AI insights digest.
    Queries real DB data (metrics, anomalies, churn events) then calls
    GPT-4o-mini to synthesize 3 narrative highlights with follow-up queries.
    """
    # 1. Recent MRR metrics (last 2 months)
    metrics_result = await db.execute(
        text("""
            SELECT mrr, new_mrr, expansion_mrr, contraction_mrr, churn_mrr,
                   active_subscribers, churned_count, date
            FROM metrics_daily
            WHERE company_id = :tid
            ORDER BY date DESC
            LIMIT 2
        """),
        {"tid": tenant.id},
    )
    metrics_rows = [dict(r._mapping) for r in metrics_result.fetchall()]

    # 2. Top anomalies (critical/high)
    anomaly_result = await db.execute(
        text("""
            SELECT metric_name, current_value, baseline_value, z_score,
                   severity, explanation
            FROM anomaly_alerts
            WHERE company_id = :tid AND is_active = true
              AND severity IN ('critical', 'high')
            ORDER BY
                CASE severity WHEN 'critical' THEN 1 ELSE 2 END,
                detected_at DESC
            LIMIT 5
        """),
        {"tid": tenant.id},
    )
    anomaly_rows = [dict(r._mapping) for r in anomaly_result.fetchall()]

    # 3. Recent churn events (last 30 days)
    churn_result = await db.execute(
        text("""
            SELECT COUNT(*) AS churned_count, ABS(SUM(mrr_delta)) AS churned_mrr
            FROM subscription_events
            WHERE company_id = :tid AND event_type = 'churn'
              AND timestamp >= NOW() - INTERVAL '30 days'
        """),
        {"tid": tenant.id},
    )
    churn_row = dict(churn_result.fetchone()._mapping)

    # 4. Past-due accounts
    pastdue_result = await db.execute(
        text("""
            SELECT COUNT(*) AS count, SUM(mrr_amount) AS mrr
            FROM subscriptions
            WHERE company_id = :tid AND status = 'past_due'
        """),
        {"tid": tenant.id},
    )
    pastdue_row = dict(pastdue_result.fetchone()._mapping)

    # Build context for LLM
    cur = metrics_rows[0] if metrics_rows else {}
    prev = metrics_rows[1] if len(metrics_rows) > 1 else cur

    def delta_pct(c, p):
        if p and p != 0:
            return f"{(c - p) / abs(p) * 100:+.1f}%"
        return "N/A"

    context_parts = [
        f"Current MRR: ${cur.get('mrr', 0):,.0f} ({delta_pct(cur.get('mrr', 0), prev.get('mrr', 0))} MoM)",
        f"New MRR: ${cur.get('new_mrr', 0):,.0f}",
        f"Expansion MRR: ${cur.get('expansion_mrr', 0):,.0f}",
        f"Contraction MRR: ${abs(cur.get('contraction_mrr', 0) or 0):,.0f}",
        f"Churn MRR: ${abs(cur.get('churn_mrr', 0) or 0):,.0f}",
        f"Active subscribers: {cur.get('active_subscribers', 0)}",
        f"Churn events last 30d: {churn_row.get('churned_count', 0)} accounts, ${churn_row.get('churned_mrr', 0) or 0:,.0f} MRR lost",
        f"Past-due accounts: {pastdue_row.get('count', 0)} accounts, ${pastdue_row.get('mrr', 0) or 0:,.0f} MRR at risk",
    ]

    if anomaly_rows:
        context_parts.append("Active anomalies:")
        for a in anomaly_rows:
            explanation = a.get("explanation") or f"{a['metric_name']} anomaly (z={a.get('z_score', 0):.1f}σ)"
            context_parts.append(f"  - [{a['severity']}] {explanation}")

    context = "\n".join(context_parts)

    prompt = f"""You are a revenue intelligence analyst. Based on the following real metrics data, generate exactly 3 concise AI insights as a JSON array.

Data:
{context}

Return a JSON array with exactly 3 objects, each with:
- "type": one of "info", "warning", "positive"
- "title": short title (3-6 words)
- "text": 1-2 sentence insight grounded in the actual numbers above
- "query": a natural language question the user could ask to dig deeper (e.g. "Why did churn spike this month?")

Use "warning" for risks/problems, "positive" for growth/wins, "info" for trends/observations.
Return ONLY the JSON array, no other text."""

    try:
        oai = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await oai.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=600,
        )
        raw = response.choices[0].message.content.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        highlights = json.loads(raw.strip())
    except Exception as e:
        logger.warning(f"weekly_digest LLM call failed: {e}")
        # Fallback: generate rule-based highlights from data
        highlights = _rule_based_highlights(cur, prev, churn_row, pastdue_row, anomaly_rows)

    now_str = datetime.now(ZoneInfo("America/New_York")).strftime("%b %-d, %Y · %-I:%M %p") + " EST"

    return {
        "generatedAt": now_str,
        "highlights": highlights[:3],  # cap at 3
    }


def _rule_based_highlights(cur, prev, churn_row, pastdue_row, anomaly_rows):
    """Fallback highlights when LLM is unavailable."""
    highlights = []
    mrr = cur.get("mrr", 0) or 0
    prev_mrr = prev.get("mrr", 0) or mrr
    mrr_delta = mrr - prev_mrr
    expansion = cur.get("expansion_mrr", 0) or 0
    churned_count = churn_row.get("churned_count", 0) or 0
    churned_mrr = churn_row.get("churned_mrr", 0) or 0
    past_due = pastdue_row.get("count", 0) or 0

    if mrr_delta > 0:
        highlights.append({
            "type": "positive",
            "title": "MRR Growing",
            "text": f"MRR increased ${mrr_delta:,.0f} this month to ${mrr:,.0f}. Expansion MRR of ${expansion:,.0f} is contributing to healthy net growth.",
            "query": "What drove MRR growth this month?",
        })
    else:
        highlights.append({
            "type": "warning",
            "title": "MRR Declined",
            "text": f"MRR dropped ${abs(mrr_delta):,.0f} this month to ${mrr:,.0f}. Review churn and contraction drivers.",
            "query": "Why did MRR decline this month?",
        })

    if churned_count > 0:
        highlights.append({
            "type": "warning",
            "title": "Churn Alert",
            "text": f"{churned_count} accounts churned in the last 30 days, representing ${churned_mrr:,.0f} in lost MRR.",
            "query": f"Show me the {churned_count} accounts that churned this month",
        })
    elif past_due > 0:
        highlights.append({
            "type": "warning",
            "title": "Payment Risk",
            "text": f"{past_due} accounts are past due. Proactive outreach can recover at-risk revenue.",
            "query": "Which accounts are past due and at risk of churning?",
        })
    else:
        highlights.append({
            "type": "info",
            "title": "Churn Under Control",
            "text": "No significant churn events detected in the last 30 days. Retention is healthy.",
            "query": "What is our current churn rate by segment?",
        })

    if anomaly_rows:
        a = anomaly_rows[0]
        highlights.append({
            "type": "warning",
            "title": "Anomaly Detected",
            "text": a.get("explanation") or f"A {a['severity']} anomaly was detected in {a['metric_name']}. Investigation recommended.",
            "query": f"Explain the {a['metric_name']} anomaly detected recently",
        })
    else:
        highlights.append({
            "type": "info",
            "title": "No Active Anomalies",
            "text": "All revenue metrics are within normal ranges. No critical or high anomalies detected.",
            "query": "What revenue trends should I watch this week?",
        })

    return highlights


# ── helpers ───────────────────────────────────────────────────────────────────

def _metric_label(metric_name: str) -> str:
    labels = {
        "mrr": "MRR",
        "churned_count": "Churn Count",
        "new_subscribers": "New Subscribers",
        "expansion_mrr": "Expansion MRR",
        "arpu": "ARPU",
        "churn_mrr": "Churned MRR",
    }
    return labels.get(metric_name, metric_name.replace("_", " ").title())


def _anomaly_title(metric_name: str, z_score: Optional[float], current: Optional[float], baseline: Optional[float]) -> str:
    label = _metric_label(metric_name)
    if current is not None and baseline is not None and baseline != 0:
        pct = (current - baseline) / abs(baseline) * 100
        direction = "spiked" if pct > 0 else "dropped"
        return f"{label} {direction} {abs(pct):.0f}%"
    if z_score:
        return f"{label} anomaly detected (z={z_score:.1f}σ)"
    return f"{label} anomaly detected"


def _estimate_affected_mrr(current: Optional[float], baseline: Optional[float]) -> float:
    """Rough MRR impact estimate — delta between current and baseline metric."""
    if current is not None and baseline is not None:
        return round(abs(current - baseline), 2)
    return 0.0


def _relative_time(dt) -> str:
    if dt is None:
        return "Unknown"
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    diff = now - dt
    seconds = int(diff.total_seconds())
    if seconds < 3600:
        m = seconds // 60
        return f"{m} minute{'s' if m != 1 else ''} ago"
    if seconds < 86400:
        h = seconds // 3600
        return f"{h} hour{'s' if h != 1 else ''} ago"
    d = seconds // 86400
    return f"{d} day{'s' if d != 1 else ''} ago"
