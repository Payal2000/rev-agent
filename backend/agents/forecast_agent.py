"""Forecast Agent — time-series projections with statsmodels + LLM narrative."""
import logging
from typing import Optional

import numpy as np
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from scipy import stats
from langchain_openai import ChatOpenAI
from langchain_core.messages import AIMessage
from sqlalchemy import text

from config import settings
from data.database import get_session
from graph.state import RevAgentState, ForecastResult

logger = logging.getLogger(__name__)

llm = ChatOpenAI(
    model=settings.openai_model,
    api_key=settings.openai_api_key,
    temperature=0.3,
)


async def forecast_agent(state: RevAgentState) -> RevAgentState:
    """Project MRR and churn trends with statistical models."""
    tenant_id = state["tenant_id"]
    current_step = state.get("current_step", 0)

    logger.info(f"[ForecastAgent] Running forecasts for tenant {tenant_id}")

    # Fetch 90 days of historical MRR
    historical = await _fetch_mrr_history(tenant_id, days=90)
    if len(historical) < 14:
        return {
            **state,
            "forecast": None,
            "current_step": current_step + 1,
            "error": "Insufficient historical data for forecasting (need 14+ days)",
        }

    mrr_series = [row["mrr"] for row in historical]
    dates = [row["date"] for row in historical]

    # Statistical projection
    projection = _project_mrr(mrr_series, forecast_days=90)
    trend = _detect_trend(mrr_series)

    # Generate LLM narrative combining stats + business context
    narrative = await _generate_forecast_narrative(
        current_mrr=mrr_series[-1],
        projection=projection,
        trend=trend,
        anomalies=state.get("anomalies", []),
    )

    forecast_result = ForecastResult(
        metric="mrr",
        projection_30d=round(projection["30d"], 2),
        projection_60d=round(projection["60d"], 2),
        projection_90d=round(projection["90d"], 2),
        confidence_interval_80={
            "low": round(projection["ci_80_low"], 2),
            "high": round(projection["ci_80_high"], 2),
        },
        confidence_interval_95={
            "low": round(projection["ci_95_low"], 2),
            "high": round(projection["ci_95_high"], 2),
        },
        trend=trend,
        narrative=narrative,
    )

    new_messages = state["messages"] + [
        AIMessage(content=f"**Forecast:**\n{narrative}")
    ]

    return {
        **state,
        "forecast": forecast_result,
        "messages": new_messages,
        "current_step": current_step + 1,
    }


async def _fetch_mrr_history(tenant_id: str, days: int = 90) -> list[dict]:
    async with get_session() as session:
        result = await session.execute(
            text("""
                SELECT date, mrr, churned_count, new_subscribers, active_subscribers
                FROM metrics_daily
                WHERE company_id = :tenant_id
                  AND date >= NOW() - INTERVAL '1 day' * :days
                ORDER BY date ASC
            """),
            {"tenant_id": tenant_id, "days": days}
        )
        return [dict(row._mapping) for row in result.fetchall()]


def _project_mrr(series: list[float], forecast_days: int = 90) -> dict:
    """Apply Holt-Winters exponential smoothing for MRR projection."""
    arr = np.array(series, dtype=float)

    try:
        # Holt-Winters with trend but no seasonality (SaaS MRR is non-seasonal)
        model = ExponentialSmoothing(
            arr,
            trend="add",
            seasonal=None,
            initialization_method="estimated",
        ).fit(optimized=True)

        forecast = model.forecast(forecast_days)
        residuals = model.resid

        # Confidence intervals based on residual standard error
        se = float(np.std(residuals))
        z_80 = stats.norm.ppf(0.90)  # 80% CI
        z_95 = stats.norm.ppf(0.975)  # 95% CI

        return {
            "30d": float(forecast[29]),
            "60d": float(forecast[59]),
            "90d": float(forecast[89]),
            "ci_80_low": float(forecast[29]) - z_80 * se * np.sqrt(30),
            "ci_80_high": float(forecast[29]) + z_80 * se * np.sqrt(30),
            "ci_95_low": float(forecast[29]) - z_95 * se * np.sqrt(30),
            "ci_95_high": float(forecast[29]) + z_95 * se * np.sqrt(30),
            "full_series": [float(v) for v in forecast],
        }

    except Exception as e:
        logger.warning(f"[ForecastAgent] ExponentialSmoothing failed, falling back to linear: {e}")
        return _linear_projection(arr, forecast_days)


def _linear_projection(arr: np.ndarray, forecast_days: int) -> dict:
    """Linear regression fallback."""
    x = np.arange(len(arr))
    slope, intercept, r_value, p_value, std_err = stats.linregress(x, arr)

    def project(days_ahead: int) -> float:
        return float(intercept + slope * (len(arr) + days_ahead))

    residuals = arr - (intercept + slope * x)
    se = float(np.std(residuals))

    return {
        "30d": project(30),
        "60d": project(60),
        "90d": project(90),
        "ci_80_low": project(30) - 1.28 * se * np.sqrt(30),
        "ci_80_high": project(30) + 1.28 * se * np.sqrt(30),
        "ci_95_low": project(30) - 1.96 * se * np.sqrt(30),
        "ci_95_high": project(30) + 1.96 * se * np.sqrt(30),
        "full_series": [project(d) for d in range(1, forecast_days + 1)],
    }


def _detect_trend(series: list[float]) -> str:
    """Detect overall trend direction from recent data."""
    if len(series) < 7:
        return "stable"
    recent = series[-14:]
    x = np.arange(len(recent))
    slope, _, r_value, p_value, _ = stats.linregress(x, recent)

    if p_value > 0.1:
        return "stable"

    pct_change_per_day = slope / max(abs(np.mean(recent)), 1)
    if pct_change_per_day > 0.002:
        return "improving"
    elif pct_change_per_day < -0.002:
        return "declining"
    return "stable"


async def _generate_forecast_narrative(
    current_mrr: float,
    projection: dict,
    trend: str,
    anomalies: list,
) -> str:
    """LLM generates business-contextual forecast narrative."""
    pct_30d = ((projection["30d"] - current_mrr) / current_mrr * 100) if current_mrr else 0

    anomaly_context = ""
    if anomalies:
        top_anomaly = anomalies[0]
        anomaly_context = (
            f"\nRecent anomaly detected: {top_anomaly['metric_name']} "
            f"(z-score: {top_anomaly['z_score']:.1f}, {top_anomaly['severity']} severity)"
        )

    prompt = (
        f"You are a SaaS revenue analyst writing a forecast summary.\n\n"
        f"Current MRR: ${current_mrr:,.2f}\n"
        f"30-day projection: ${projection['30d']:,.2f} ({pct_30d:+.1f}%)\n"
        f"60-day projection: ${projection['60d']:,.2f}\n"
        f"90-day projection: ${projection['90d']:,.2f}\n"
        f"80% confidence interval (30d): ${projection['ci_80_low']:,.0f} – ${projection['ci_80_high']:,.0f}\n"
        f"Trend: {trend}"
        f"{anomaly_context}\n\n"
        f"Write a 3-4 sentence business-focused forecast narrative. "
        f"Include the projection, confidence interval, trend direction, and any risk factors from anomalies. "
        f"Be specific with numbers. End with a one-sentence business implication."
    )

    response = await llm.ainvoke(prompt)
    return response.content
