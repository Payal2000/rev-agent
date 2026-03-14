"""Health check endpoints."""
from datetime import datetime

from fastapi import APIRouter
from sqlalchemy import text

from config import settings
from data.database import engine
from llm import get_async_openai

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok", "service": "revagent-backend"}


@router.get("/health/db")
async def health_db():
    """Check database connectivity."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": str(e)}


@router.get("/health/llm")
async def health_llm():
    """Check OpenAI API key validity with a minimal test call."""
    try:
        oai = get_async_openai()
        await oai.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=1,
        )
        return {"status": "ok", "model": settings.openai_model, "provider": "openai"}
    except Exception as e:
        return {"status": "error", "model": settings.openai_model, "detail": str(e)}


@router.get("/health/data-sync")
async def health_data_sync():
    """Return latest data sync signals for frontend status badges."""
    try:
        async with engine.connect() as conn:
            result = await conn.execute(
                text(
                    """
                    SELECT
                        (SELECT MAX(created_at) FROM stripe_webhook_events) AS last_webhook_event_at,
                        (SELECT MAX(processed_at) FROM stripe_webhook_events WHERE status = 'processed') AS last_webhook_processed_at,
                        (SELECT MAX(created_at) FROM invoices) AS last_invoice_at,
                        (SELECT MAX(updated_at) FROM subscriptions) AS last_subscription_update_at,
                        (SELECT MAX(date) FROM metrics_daily) AS latest_metrics_date
                    """
                )
            )
            row = result.mappings().first()
            if not row:
                return {"status": "ok", "last_synced_at": None}

            candidates = [
                row.get("last_webhook_event_at"),
                row.get("last_webhook_processed_at"),
                row.get("last_invoice_at"),
                row.get("last_subscription_update_at"),
                row.get("latest_metrics_date"),
            ]
            last_synced_at = None
            for value in candidates:
                if isinstance(value, datetime):
                    last_synced_at = value if last_synced_at is None or value > last_synced_at else last_synced_at

            return {
                "status": "ok",
                "last_synced_at": last_synced_at,
                "signals": {
                    "last_webhook_event_at": row.get("last_webhook_event_at"),
                    "last_webhook_processed_at": row.get("last_webhook_processed_at"),
                    "last_invoice_at": row.get("last_invoice_at"),
                    "last_subscription_update_at": row.get("last_subscription_update_at"),
                    "latest_metrics_date": row.get("latest_metrics_date"),
                },
            }
    except Exception as e:
        return {"status": "error", "detail": str(e), "last_synced_at": None}


@router.get("/health/widget-status")
async def health_widget_status():
    """Per-widget freshness and coverage for dashboard/insights/forecast pages."""
    try:
        async with engine.connect() as conn:
            result = await conn.execute(
                text(
                    """
                    SELECT
                        (SELECT COUNT(*) FROM metrics_daily) AS metrics_count,
                        (SELECT MAX(date) FROM metrics_daily) AS metrics_last_at,
                        (SELECT COUNT(*) FROM metrics_daily WHERE date >= NOW() - INTERVAL '90 days') AS metrics_90d_count,
                        (SELECT COUNT(*) FROM subscriptions) AS subscriptions_count,
                        (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') AS subscriptions_active_count,
                        (SELECT MAX(updated_at) FROM subscriptions) AS subscriptions_last_at,
                        (SELECT COUNT(*) FROM invoices) AS invoices_count,
                        (SELECT MAX(created_at) FROM invoices) AS invoices_last_at,
                        (SELECT COUNT(*) FROM anomaly_alerts WHERE is_active = true) AS anomalies_active_count,
                        (SELECT MAX(detected_at) FROM anomaly_alerts) AS anomalies_last_at,
                        (SELECT COUNT(*) FROM subscription_events) AS sub_events_count,
                        (SELECT MAX(timestamp) FROM subscription_events) AS sub_events_last_at,
                        (SELECT COUNT(*) FROM stripe_webhook_events) AS webhook_events_count,
                        (SELECT MAX(processed_at) FROM stripe_webhook_events WHERE status = 'processed') AS webhook_last_processed_at
                    """
                )
            )
            row = result.mappings().first()
            if not row:
                return {"status": "ok", "widgets": {}, "summary": {"healthy": 0, "total": 0}}

        def age_hours(ts):
            if not isinstance(ts, datetime):
                return None
            return max(0.0, (datetime.utcnow() - ts.replace(tzinfo=None)).total_seconds() / 3600.0)

        def to_widget(name: str, source_table: str, count: int, last_at, stale_after_hours: float, min_count: int = 1):
            age = age_hours(last_at)
            if (count or 0) < min_count:
                state = "empty"
                reason = f"Needs at least {min_count} rows from {source_table}, found {int(count or 0)}."
            elif age is not None and age > stale_after_hours:
                state = "stale"
                reason = f"Last update is {round(age, 2)}h old (threshold: {stale_after_hours}h)."
            else:
                state = "live"
                reason = "Data is fresh and meets minimum coverage."
            return {
                "name": name,
                "source_table": source_table,
                "status": state,
                "row_count": int(count or 0),
                "last_updated_at": last_at,
                "age_hours": round(age, 2) if age is not None else None,
                "reason": reason,
            }

        widgets = {
            "dashboard_kpis": to_widget(
                "Dashboard KPIs", "metrics_daily",
                row.get("metrics_count"), row.get("metrics_last_at"), stale_after_hours=30,
            ),
            "dashboard_mrr_trend": to_widget(
                "MRR Trend Chart", "metrics_daily",
                row.get("metrics_count"), row.get("metrics_last_at"), stale_after_hours=30,
            ),
            "dashboard_at_risk_accounts": to_widget(
                "At-Risk Accounts", "subscriptions",
                row.get("subscriptions_active_count"), row.get("subscriptions_last_at"), stale_after_hours=24,
            ),
            "insights_signals": to_widget(
                "Insights Signals", "metrics_daily",
                row.get("metrics_count"), row.get("metrics_last_at"), stale_after_hours=30,
            ),
            "insights_churn_intelligence": to_widget(
                "Churn Intelligence", "subscription_events",
                row.get("sub_events_count"), row.get("sub_events_last_at"), stale_after_hours=72,
            ),
            "insights_segment_health": to_widget(
                "Segment Health", "subscriptions",
                row.get("subscriptions_count"), row.get("subscriptions_last_at"), stale_after_hours=24,
            ),
            "insights_operational_alerts": to_widget(
                "Operational Alerts", "invoices",
                row.get("invoices_count"), row.get("invoices_last_at"), stale_after_hours=72,
            ),
            "insights_anomalies": to_widget(
                "Anomaly Feed", "anomaly_alerts",
                row.get("anomalies_active_count"), row.get("anomalies_last_at"), stale_after_hours=72,
            ),
            "forecast_model_input": to_widget(
                "Forecast Input Series", "metrics_daily",
                row.get("metrics_90d_count"), row.get("metrics_last_at"), stale_after_hours=30, min_count=14,
            ),
            "stripe_ingestion": to_widget(
                "Stripe Webhook Ingestion", "stripe_webhook_events",
                row.get("webhook_events_count"), row.get("webhook_last_processed_at"), stale_after_hours=24,
            ),
        }

        healthy = sum(1 for widget in widgets.values() if widget["status"] == "live")
        total = len(widgets)

        return {
            "status": "ok",
            "widgets": widgets,
            "summary": {"healthy": healthy, "total": total},
        }
    except Exception as e:
        return {
            "status": "error",
            "detail": str(e),
            "widgets": {},
            "summary": {"healthy": 0, "total": 0},
        }
