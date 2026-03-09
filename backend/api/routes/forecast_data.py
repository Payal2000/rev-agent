"""Forecast REST endpoint — Holt-Winters MRR projections without LLM narrative."""
import logging

from fastapi import APIRouter
from sqlalchemy import text

from api.dependencies import DBDep, TenantDep
from agents.forecast_agent import _project_mrr, _detect_trend

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/forecast/mrr")
async def forecast_mrr(db: DBDep, tenant: TenantDep):
    """
    Run Holt-Winters on the last 90 days of MRR and return 3-month projections.
    Returns chart-ready data matching the FORECAST_DATA mock shape.
    """
    # Fetch historical MRR
    result = await db.execute(
        text("""
            SELECT date, mrr
            FROM metrics_daily
            WHERE company_id = :tenant_id
              AND date >= NOW() - INTERVAL '90 days'
            ORDER BY date ASC
        """),
        {"tenant_id": tenant.id},
    )
    rows = [dict(r._mapping) for r in result.fetchall()]

    if len(rows) < 14:
        return {"error": "Insufficient data for forecast (need 14+ days)", "data": [], "stats": None}

    mrr_series = [r["mrr"] for r in rows]
    projection = _project_mrr(mrr_series, forecast_days=90)
    trend = _detect_trend(mrr_series)

    # Build actuals (last 4 months) + projections (next 3 months) for the chart
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)

    # Monthly actuals: last 4 completed months from metrics_daily
    actuals_result = await db.execute(
        text("""
            SELECT
                TO_CHAR(date, 'Mon') AS month,
                TO_CHAR(date, 'YYYY-MM') AS month_key,
                MAX(mrr) AS mrr
            FROM metrics_daily
            WHERE company_id = :tenant_id
              AND date >= DATE_TRUNC('month', NOW()) - INTERVAL '4 months'
              AND date < DATE_TRUNC('month', NOW())
            GROUP BY TO_CHAR(date, 'Mon'), TO_CHAR(date, 'YYYY-MM'), DATE_TRUNC('month', date)
            ORDER BY DATE_TRUNC('month', date) ASC
        """),
        {"tenant_id": tenant.id},
    )
    actual_rows = actuals_result.fetchall()

    chart_data = [
        {
            "month": r.month,
            "actual": round(r.mrr or 0, 2),
            "p50": None, "p80lo": None, "p80hi": None, "p95lo": None, "p95hi": None,
        }
        for r in actual_rows
    ]

    # Add current month actual
    cur_result = await db.execute(
        text("""
            SELECT TO_CHAR(MAX(date), 'Mon') AS month, MAX(mrr) AS mrr
            FROM metrics_daily
            WHERE company_id = :tenant_id
              AND date >= DATE_TRUNC('month', NOW())
        """),
        {"tenant_id": tenant.id},
    )
    cur_row = cur_result.fetchone()
    if cur_row and cur_row.mrr:
        chart_data.append({
            "month": cur_row.month,
            "actual": round(cur_row.mrr, 2),
            "p50": None, "p80lo": None, "p80hi": None, "p95lo": None, "p95hi": None,
        })

    # 3 monthly projection points from the 90-day series
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    for i, (day_idx, key) in enumerate([(29, "30d"), (59, "60d"), (89, "90d")]):
        proj_month = (now.month + i) % 12
        chart_data.append({
            "month": month_names[proj_month],
            "actual": None,
            "p50": round(projection[key], 2),
            "p80lo": round(projection["ci_80_low"] * (1 + i * 0.02), 2),
            "p80hi": round(projection["ci_80_high"] * (1 + i * 0.02), 2),
            "p95lo": round(projection["ci_95_low"] * (1 + i * 0.03), 2),
            "p95hi": round(projection["ci_95_high"] * (1 + i * 0.03), 2),
        })

    return {
        "data": chart_data,
        "stats": {
            "p30": round(projection["30d"], 2),
            "p60": round(projection["60d"], 2),
            "p90": round(projection["90d"], 2),
            "ci80": {
                "low": round(projection["ci_80_low"], 2),
                "high": round(projection["ci_80_high"], 2),
            },
            "ci95": {
                "low": round(projection["ci_95_low"], 2),
                "high": round(projection["ci_95_high"], 2),
            },
            "trend": trend,
            "currentMrr": round(mrr_series[-1], 2),
        },
    }
