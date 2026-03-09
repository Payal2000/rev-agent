"""Insights REST endpoints — anomaly alerts and revenue signals."""
import logging
from typing import Optional

from fastapi import APIRouter, Query
from sqlalchemy import text

from api.dependencies import DBDep, TenantDep

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
    """Revenue signals KPIs derived from the two most recent metrics_daily rows."""
    result = await db.execute(
        text("""
            SELECT mrr, expansion_mrr, contraction_mrr, new_mrr, churn_mrr,
                   active_subscribers, date
            FROM metrics_daily
            WHERE company_id = :tenant_id
            ORDER BY date DESC
            LIMIT 2
        """),
        {"tenant_id": tenant.id},
    )
    rows = [dict(r._mapping) for r in result.fetchall()]

    if not rows:
        return []

    cur = rows[0]
    prev = rows[1] if len(rows) > 1 else cur

    def pct(c, p):
        if p and p != 0:
            return f"{(c - p) / abs(p) * 100:+.1f}%"
        return "—"

    def sign(val):
        return "up" if val >= 0 else "down"

    mrr_delta = (cur["mrr"] or 0) - (prev["mrr"] or 0)
    expansion = cur["expansion_mrr"] or 0
    prev_expansion = prev["expansion_mrr"] or 0
    contraction = cur["contraction_mrr"] or 0
    prev_contraction = prev["contraction_mrr"] or 0

    return [
        {
            "label": "MRR Growth MoM",
            "value": f"+${mrr_delta:,.0f}" if mrr_delta >= 0 else f"-${abs(mrr_delta):,.0f}",
            "delta": pct(cur["mrr"] or 0, prev["mrr"] or 0),
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
            "value": f"${abs(cur['churn_mrr'] or 0):,.0f}",
            "delta": pct(abs(cur["churn_mrr"] or 0), abs(prev["churn_mrr"] or 0)),
            "trend": "down" if abs(cur["churn_mrr"] or 0) > abs(prev["churn_mrr"] or 0) else "up",
            "note": "",
            "colorKey": "sky",
        },
    ]


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
