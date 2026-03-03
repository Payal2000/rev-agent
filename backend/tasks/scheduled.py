"""Scheduled Celery tasks — daily briefing and threshold-triggered insights."""
import asyncio
import logging
import uuid

from langchain_core.messages import HumanMessage

from tasks.celery_app import celery_app
from tools.slack_tools import send_daily_briefing
from tools.discord_tools import send_daily_briefing as discord_send_daily_briefing
from tools.email_tools import send_daily_briefing_email

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=300, queue="scheduled")
def run_daily_briefing(self, company_id: str = "00000000-0000-0000-0000-000000000001"):
    """
    Daily 6AM briefing: run full agent pipeline and post to Slack.
    Triggered by Celery Beat schedule.
    """
    try:
        asyncio.run(_async_daily_briefing(company_id))
    except Exception as exc:
        logger.error(f"Daily briefing failed: {exc}")
        raise self.retry(exc=exc)


async def _async_daily_briefing(company_id: str):
    from graph.graph import get_graph

    graph = await get_graph()
    session_id = f"briefing-{uuid.uuid4()}"

    initial_state = {
        "messages": [HumanMessage(
            content="Generate a complete daily revenue briefing: "
                    "show current MRR, any anomalies in the last 24 hours, "
                    "short-term forecast, and any recommended actions."
        )],
        "tenant_id": company_id,
        "session_id": session_id,
        "intent": "",
        "routing_plan": [],
        "current_step": 0,
        "query_results": None,
        "anomalies": None,
        "forecast": None,
        "recommendations": None,
        "validation_passed": False,
        "validation_score": None,
        "validation_notes": None,
        "awaiting_approval": False,
        "approval_context": None,
        "audit_trace_id": None,
        "error": None,
        "retry_count": 0,
    }

    config = {"configurable": {"thread_id": session_id}}

    # Run the full pipeline
    final_state = None
    async for state in graph.astream(initial_state, config=config, stream_mode="values"):
        final_state = state

    if not final_state:
        logger.warning("Daily briefing: no final state produced")
        return

    # Build briefing text from agent outputs
    briefing_parts = []

    if final_state.get("query_results"):
        briefing_parts.append("*Today's Revenue Snapshot:*")
        briefing_parts.append(final_state["query_results"].get("formatted", "")[:500])

    if final_state.get("anomalies"):
        briefing_parts.append(f"\n*Anomalies Detected:* {len(final_state['anomalies'])}")
        for a in final_state["anomalies"][:3]:
            briefing_parts.append(f"• {a['metric_name']}: {a['explanation'][:200]}")

    if final_state.get("forecast"):
        fc = final_state["forecast"]
        briefing_parts.append(f"\n*Forecast:* {fc.get('narrative', '')[:300]}")

    if final_state.get("recommendations"):
        briefing_parts.append("\n*Recommended Actions:*")
        for rec in final_state["recommendations"][:3]:
            briefing_parts.append(f"{rec['rank']}. {rec['title']} — {rec['estimated_impact']}")

    briefing_text = "\n".join(briefing_parts) if briefing_parts else "No significant changes today."

    # Fan out to all configured notification channels
    await send_daily_briefing(briefing_text)                    # Slack
    await discord_send_daily_briefing(briefing_text)            # Discord
    await send_daily_briefing_email(briefing_text)              # Email
    logger.info(f"Daily briefing sent for company {company_id}")


@celery_app.task(bind=True, max_retries=2, queue="agents")
def run_insights_pipeline(self, company_id: str, context: dict | None = None):
    """
    Triggered by webhook threshold breaches.
    Runs insights + action agents asynchronously.
    """
    try:
        asyncio.run(_async_insights_run(company_id, context or {}))
    except Exception as exc:
        logger.error(f"Insights pipeline failed: {exc}")
        raise self.retry(exc=exc)


async def _async_insights_run(company_id: str, context: dict):
    from graph.graph import get_graph

    graph = await get_graph()
    session_id = f"insights-{uuid.uuid4()}"

    trigger_description = context.get("description", "threshold breach detected")

    initial_state = {
        "messages": [HumanMessage(
            content=f"A {trigger_description}. Analyze the current metrics for anomalies and provide recommendations."
        )],
        "tenant_id": company_id,
        "session_id": session_id,
        "intent": "",
        "routing_plan": [],
        "current_step": 0,
        "query_results": None,
        "anomalies": None,
        "forecast": None,
        "recommendations": None,
        "validation_passed": False,
        "validation_score": None,
        "validation_notes": None,
        "awaiting_approval": False,
        "approval_context": None,
        "audit_trace_id": None,
        "error": None,
        "retry_count": 0,
    }

    config = {"configurable": {"thread_id": session_id}}

    async for _ in graph.astream(initial_state, config=config, stream_mode="values"):
        pass

    logger.info(f"Insights pipeline complete for company {company_id}")
