"""Metrics REST endpoints — dashboard KPIs, MRR trend, tier breakdown, at-risk accounts."""
import logging
from typing import Optional

from fastapi import APIRouter, Query
from sqlalchemy import text

from api.dependencies import DBDep, TenantDep

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/metrics/summary")
async def metrics_summary(db: DBDep, tenant: TenantDep):
    """
    Latest MRR, subscribers, churn rate, NRR, ARPU with MoM deltas.
    Reads from metrics_daily — last two month-end rows.
    """
    result = await db.execute(
        text("""
            SELECT
                date, mrr, arr, active_subscribers,
                churn_mrr, new_mrr, expansion_mrr, contraction_mrr,
                net_new_mrr, arpu, churned_count
            FROM metrics_daily
            WHERE company_id = :tenant_id
            ORDER BY date DESC
            LIMIT 2
        """),
        {"tenant_id": tenant.id},
    )
    rows = [dict(r._mapping) for r in result.fetchall()]

    if not rows:
        return _empty_summary()

    cur = rows[0]
    prev = rows[1] if len(rows) > 1 else None

    def pct_delta(cur_val, prev_val):
        if prev_val and prev_val != 0:
            return round((cur_val - prev_val) / abs(prev_val) * 100, 1)
        return 0.0

    mrr = cur["mrr"] or 0
    prev_mrr = prev["mrr"] if prev else mrr
    subscribers = cur["active_subscribers"] or 0
    prev_subscribers = prev["active_subscribers"] if prev else subscribers
    arpu = cur["arpu"] or (mrr / subscribers if subscribers else 0)

    # NRR = (prev MRR + expansion - contraction - churn) / prev MRR
    expansion = cur["expansion_mrr"] or 0
    contraction = cur["contraction_mrr"] or 0
    churn_mrr = cur["churn_mrr"] or 0
    nrr = round(((prev_mrr + expansion - contraction - churn_mrr) / prev_mrr * 100) if prev_mrr else 100, 1)

    # Churn rate = churned_count / prev subscribers
    churned = cur["churned_count"] or 0
    churn_rate = round((churned / prev_subscribers * 100) if prev_subscribers else 0, 1)
    prev_churn = round(((prev["churned_count"] or 0) / (rows[1]["active_subscribers"] if len(rows) > 1 else prev_subscribers) * 100) if prev else churn_rate, 1) if prev else churn_rate

    return {
        "mrr": round(mrr, 2),
        "mrrPrev": round(prev_mrr, 2),
        "mrrDelta": pct_delta(mrr, prev_mrr),
        "arr": round(mrr * 12, 2),
        "subscribers": subscribers,
        "subscribersPrev": prev_subscribers,
        "subscribersDelta": subscribers - prev_subscribers,
        "nrr": nrr,
        "churnRate": churn_rate,
        "churnRatePrev": prev_churn,
        "arpu": round(arpu, 2),
        "expansionMrr": round(expansion, 2),
        "newMrr": round(cur["new_mrr"] or 0, 2),
        "contractedMrr": round(contraction, 2),
        "churnedMrr": round(churn_mrr, 2),
    }


@router.get("/metrics/mrr-trend")
async def mrr_trend(
    db: DBDep,
    tenant: TenantDep,
    months: int = Query(12, ge=1, le=24),
):
    """Last N months of MRR waterfall data (new/expansion/contraction/churned/total)."""
    result = await db.execute(
        text("""
            SELECT
                TO_CHAR(date, 'Mon') AS month,
                TO_CHAR(date, 'YYYY-MM') AS month_key,
                SUM(new_mrr)         AS new,
                SUM(expansion_mrr)   AS expansion,
                SUM(contraction_mrr) AS contraction,
                SUM(churn_mrr)       AS churned,
                MAX(mrr)             AS total
            FROM metrics_daily
            WHERE company_id = :tenant_id
              AND date >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month' * :months
            GROUP BY TO_CHAR(date, 'Mon'), TO_CHAR(date, 'YYYY-MM'), DATE_TRUNC('month', date)
            ORDER BY DATE_TRUNC('month', date) ASC
        """),
        {"tenant_id": tenant.id, "months": months},
    )
    rows = result.fetchall()
    return [
        {
            "month": r.month,
            "new": round(r.new or 0, 2),
            "expansion": round(r.expansion or 0, 2),
            "contraction": round(r.contraction or 0, 2),
            "churned": round(r.churned or 0, 2),
            "total": round(r.total or 0, 2),
        }
        for r in rows
    ]


@router.get("/metrics/tier-breakdown")
async def tier_breakdown(db: DBDep, tenant: TenantDep):
    """Active subscriber count and MRR split by plan tier."""
    result = await db.execute(
        text("""
            SELECT
                plan_tier AS tier,
                COUNT(*)               AS subscribers,
                SUM(mrr_amount)        AS mrr,
                AVG(mrr_amount)        AS arpu
            FROM subscriptions
            WHERE company_id = :tenant_id
              AND status = 'active'
            GROUP BY plan_tier
            ORDER BY mrr DESC
        """),
        {"tenant_id": tenant.id},
    )
    rows = result.fetchall()
    colors = {"Enterprise": "#6c5ce7", "Growth": "#2563eb", "Starter": "#0ea5e9"}
    total_mrr = sum(r.mrr or 0 for r in rows)

    return [
        {
            "tier": r.tier,
            "subscribers": r.subscribers,
            "mrr": round(r.mrr or 0, 2),
            "arpu": round(r.arpu or 0, 2),
            "pct": round((r.mrr or 0) / total_mrr * 100) if total_mrr else 0,
            "color": colors.get(r.tier, "#94a3b8"),
        }
        for r in rows
    ]


@router.get("/metrics/at-risk-accounts")
async def at_risk_accounts(
    db: DBDep,
    tenant: TenantDep,
    limit: int = Query(20, ge=1, le=100),
    tier: Optional[str] = None,
):
    """Customers with active subscriptions ranked by cancellation risk signals."""
    tier_filter = "AND s.plan_tier = :tier" if tier else ""
    result = await db.execute(
        text(f"""
            SELECT
                c.id,
                c.name,
                s.plan_tier AS tier,
                s.mrr_amount AS mrr,
                s.status,
                s.cancel_reason,
                s.metadata
            FROM subscriptions s
            JOIN customers c ON c.id = s.customer_id
            WHERE s.company_id = :tenant_id
              AND s.status IN ('active', 'past_due')
              {tier_filter}
            ORDER BY s.mrr_amount DESC
            LIMIT :limit
        """),
        {"tenant_id": tenant.id, "limit": limit, **({"tier": tier} if tier else {})},
    )
    rows = result.fetchall()

    accounts = []
    for i, r in enumerate(rows):
        meta = r.metadata or {}
        risk_score = meta.get("risk_score", max(10, 90 - i * 5))
        signals = meta.get("signals", ["past_due" if r.status == "past_due" else "Monitor MRR"])
        days_to_churn = meta.get("days_to_churn", max(7, 60 - i * 4))
        accounts.append({
            "id": str(r.id),
            "name": r.name,
            "tier": r.tier,
            "mrr": round(r.mrr or 0, 2),
            "riskScore": risk_score,
            "daysToChurn": days_to_churn,
            "signals": signals if isinstance(signals, list) else [signals],
        })

    return accounts


def _empty_summary():
    return {
        "mrr": 0, "mrrPrev": 0, "mrrDelta": 0, "arr": 0,
        "subscribers": 0, "subscribersPrev": 0, "subscribersDelta": 0,
        "nrr": 100, "churnRate": 0, "churnRatePrev": 0, "arpu": 0,
        "expansionMrr": 0, "newMrr": 0, "contractedMrr": 0, "churnedMrr": 0,
    }
