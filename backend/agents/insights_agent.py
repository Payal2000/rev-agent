"""Insights Agent — anomaly detection with z-score, period-over-period, and narrative generation."""
import logging
from typing import Optional

import numpy as np
from langchain_openai import ChatOpenAI
from langchain_core.messages import AIMessage
from sqlalchemy import text

from config import settings
from data.database import get_session
from graph.state import RevAgentState, Anomaly

logger = logging.getLogger(__name__)

llm = ChatOpenAI(
    model=settings.openai_model,
    api_key=settings.openai_api_key,
    temperature=0.2,
)

ANOMALY_THRESHOLD = 2.0   # z-score threshold for flagging
LOOKBACK_DAYS = 90
KEY_METRICS = ["mrr", "churned_count", "new_subscribers", "expansion_mrr", "arpu"]


async def insights_agent(state: RevAgentState) -> RevAgentState:
    """Detect anomalies in SaaS metrics and generate explanations."""
    tenant_id = state["tenant_id"]
    current_step = state.get("current_step", 0)

    logger.info(f"[InsightsAgent] Running anomaly detection for tenant {tenant_id}")

    # Fetch historical metrics
    historical = await _fetch_historical_metrics(tenant_id, days=LOOKBACK_DAYS)
    if not historical:
        return {
            **state,
            "anomalies": [],
            "current_step": current_step + 1,
        }

    # Detect anomalies for each metric
    anomalies: list[Anomaly] = []
    for metric in KEY_METRICS:
        values = [row.get(metric, 0) for row in historical]
        if len(values) < 7:
            continue

        current_value = values[-1]
        baseline_values = values[:-1]

        z_score = _compute_z_score(current_value, baseline_values)
        severity = _z_score_to_severity(z_score)

        if abs(z_score) >= ANOMALY_THRESHOLD:
            baseline_mean = float(np.mean(baseline_values))

            # Period-over-period change
            pop_change = _period_over_period(values, period=7)  # week-over-week

            explanation = await _generate_explanation(
                metric_name=metric,
                current_value=current_value,
                baseline_mean=baseline_mean,
                z_score=z_score,
                pop_change=pop_change,
                query_results=state.get("query_results"),
                tenant_id=tenant_id,
            )

            anomalies.append(Anomaly(
                metric_name=metric,
                current_value=current_value,
                baseline_value=baseline_mean,
                z_score=z_score,
                severity=severity,
                explanation=explanation,
                period="last 90 days",
            ))

            logger.info(f"[InsightsAgent] Anomaly detected: {metric} z={z_score:.2f} ({severity})")

    # Sort by severity impact
    anomalies.sort(key=lambda a: abs(a["z_score"]), reverse=True)

    # Append narrative to messages
    narrative = _build_narrative(anomalies)
    new_messages = state["messages"] + [AIMessage(content=f"**Insights Analysis:**\n{narrative}")]

    return {
        **state,
        "anomalies": anomalies,
        "messages": new_messages,
        "current_step": current_step + 1,
    }


async def _fetch_historical_metrics(tenant_id: str, days: int = 90) -> list[dict]:
    async with get_session() as session:
        result = await session.execute(
            text("""
                SELECT date, mrr, arr, churned_count, new_subscribers,
                       expansion_mrr, contraction_mrr, net_new_mrr, arpu, active_subscribers
                FROM metrics_daily
                WHERE company_id = :tenant_id
                  AND date >= NOW() - INTERVAL '1 day' * :days
                ORDER BY date ASC
            """),
            {"tenant_id": tenant_id, "days": days}
        )
        return [dict(row._mapping) for row in result.fetchall()]


def _compute_z_score(current: float, baseline: list[float]) -> float:
    if not baseline or len(baseline) < 3:
        return 0.0
    mean = float(np.mean(baseline))
    std = float(np.std(baseline))
    if std == 0:
        return 0.0
    return (current - mean) / std


def _z_score_to_severity(z_score: float) -> str:
    abs_z = abs(z_score)
    if abs_z >= 4.0:
        return "critical"
    elif abs_z >= 3.0:
        return "high"
    elif abs_z >= 2.0:
        return "medium"
    return "low"


def _period_over_period(values: list[float], period: int = 7) -> Optional[float]:
    """Compute percentage change vs N periods ago."""
    if len(values) < period + 1:
        return None
    current = values[-1]
    previous = values[-1 - period]
    if previous == 0:
        return None
    return round(((current - previous) / previous) * 100, 1)


async def _generate_explanation(
    metric_name: str,
    current_value: float,
    baseline_mean: float,
    z_score: float,
    pop_change: Optional[float],
    query_results: Optional[dict],
    tenant_id: str,
) -> str:
    """Use LLM to generate a business-friendly explanation of the anomaly."""
    direction = "increased" if z_score > 0 else "decreased"
    pct_change = abs((current_value - baseline_mean) / baseline_mean * 100) if baseline_mean != 0 else 0

    context_parts = [
        f"Metric: {metric_name}",
        f"Current value: {current_value:.2f}",
        f"90-day baseline mean: {baseline_mean:.2f}",
        f"Z-score: {z_score:.2f} ({abs(z_score):.1f} standard deviations from baseline)",
        f"Change: {direction} {pct_change:.1f}% vs baseline",
    ]

    if pop_change is not None:
        context_parts.append(f"Week-over-week change: {pop_change:+.1f}%")

    if query_results and query_results.get("formatted"):
        context_parts.append(f"\nRelated query data:\n{query_results['formatted'][:500]}")

    prompt = (
        f"You are a SaaS revenue analyst. An anomaly was detected.\n\n"
        f"{chr(10).join(context_parts)}\n\n"
        f"Write a 2-3 sentence business explanation of this anomaly. "
        f"Be specific about the metric, the magnitude, and potential business implications. "
        f"If related data is provided, reference it. Be concise and action-oriented."
    )

    response = await llm.ainvoke(prompt)
    return response.content


def _build_narrative(anomalies: list[Anomaly]) -> str:
    if not anomalies:
        return "No anomalies detected. All metrics are within normal ranges."

    lines = [f"Detected {len(anomalies)} anomaly/anomalies:\n"]
    for a in anomalies:
        lines.append(f"**{a['metric_name'].replace('_', ' ').title()}** ({a['severity'].upper()})")
        lines.append(f"Z-score: {a['z_score']:.2f}σ | Current: {a['current_value']:.2f} vs baseline {a['baseline_value']:.2f}")
        lines.append(a["explanation"])
        lines.append("")

    return "\n".join(lines)
