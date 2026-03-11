"""Discord notification sender for anomaly alerts and daily briefings."""
import logging
import re
from typing import Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)


async def send_anomaly_alert(
    metric_name: str,
    explanation: str,
    severity: str,
    z_score: float,
    webhook_url: Optional[str] = None,
) -> bool:
    """Send an anomaly alert to Discord via webhook."""
    url = webhook_url or settings.discord_webhook_url
    if not url:
        logger.warning("Discord not configured — skipping notification")
        return False

    severity_color = {
        "low": 0xFFCC00,       # yellow
        "medium": 0xFF8800,    # orange
        "high": 0xFF2200,      # red
        "critical": 0x990000,  # dark red
    }.get(severity, 0xAAAAAA)

    severity_emoji = {"low": "🟡", "medium": "🟠", "high": "🔴", "critical": "🚨"}.get(severity, "⚠️")

    payload = {
        "embeds": [
            {
                "title": f"{severity_emoji} Revenue Anomaly Detected",
                "color": severity_color,
                "fields": [
                    {"name": "Metric", "value": metric_name, "inline": True},
                    {"name": "Severity", "value": severity.upper(), "inline": True},
                    {"name": "Z-Score", "value": f"{z_score:.2f}σ", "inline": True},
                    {"name": "Analysis", "value": explanation[:1024]},
                ],
                "footer": {"text": "RevAgent · Revenue Intelligence"},
            }
        ]
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, timeout=10)
            resp.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Discord alert failed: {e}")
        return False


async def send_daily_briefing(briefing_text: str, webhook_url: Optional[str] = None) -> bool:
    """Send the daily revenue briefing to Discord via webhook."""
    url = webhook_url or settings.discord_webhook_url
    if not url:
        return False

    snapshot = _extract_snapshot_metrics(briefing_text)
    forecast = _extract_section_text(briefing_text, "Forecast:")
    anomalies = _extract_section_text(briefing_text, "Anomalies Detected:")
    actions = _extract_actions(briefing_text)
    trend_emoji = _trend_emoji(snapshot, forecast)
    embed_color = _trend_color(snapshot)

    fields = []
    if snapshot:
        fields.extend(
            [
                {"name": "MRR", "value": f"{trend_emoji} {snapshot.get('mrr', '—')}", "inline": True},
                {"name": "Active Subs", "value": snapshot.get("active_subscribers", "—"), "inline": True},
                {"name": "Net New MRR", "value": snapshot.get("net_new_mrr", "—"), "inline": True},
                {"name": "Churned", "value": snapshot.get("churned_count", "—"), "inline": True},
                {"name": "New Subs", "value": snapshot.get("new_subscribers", "—"), "inline": True},
                {"name": "ARPU", "value": snapshot.get("arpu", "—"), "inline": True},
            ]
        )

    if anomalies:
        fields.append({"name": "Anomalies", "value": anomalies[:1024], "inline": False})
    if forecast:
        fields.append({"name": "Forecast", "value": forecast[:1024], "inline": False})
    if actions:
        fields.append({"name": "Top Actions", "value": actions[:1024], "inline": False})

    if not fields:
        fields.append({"name": "Summary", "value": briefing_text[:1024], "inline": False})

    payload = {
        "embeds": [
            {
                "title": "📊 Daily Revenue Briefing",
                "description": (
                    "Executive snapshot from RevAgent's daily run.\n"
                    f"Overall trend: {trend_emoji} {_trend_label(snapshot, forecast)}"
                ),
                "color": embed_color,
                "fields": fields[:25],  # Discord field limit
                "footer": {"text": "RevAgent · Revenue Intelligence"},
            }
        ]
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, timeout=10)
            resp.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Discord briefing failed: {e}")
        return False


def _extract_snapshot_metrics(text: str) -> dict[str, str]:
    """Parse markdown table output into a compact KPI map."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    table_lines = [ln for ln in lines if ln.startswith("|") and ln.endswith("|")]
    if len(table_lines) < 3:
        return {}

    headers = [h.strip().lower().replace(" ", "_") for h in table_lines[0].strip("|").split("|")]
    values = [v.strip() for v in table_lines[2].strip("|").split("|")]
    if len(headers) != len(values):
        return {}

    row = dict(zip(headers, values))
    return {
        "mrr": _as_currency(row.get("mrr")),
        "active_subscribers": row.get("active_subscribers", "—"),
        "net_new_mrr": _as_currency(row.get("net_new_mrr")),
        "churned_count": row.get("churned_count", "—"),
        "new_subscribers": row.get("new_subscribers", "—"),
        "arpu": _as_currency(row.get("arpu")),
    }


def _extract_section_text(text: str, marker: str) -> str:
    """Extract a short, cleaned section body after a marker."""
    plain = text.replace("*", "")
    idx = plain.find(marker)
    if idx == -1:
        return ""
    section = plain[idx + len(marker):].strip()
    # Stop at next section-style line
    section = re.split(r"\n[A-Z][A-Za-z ]+:\n|\nRecommended Actions:\n|\nForecast:\n", section, maxsplit=1)[0]
    section = " ".join(section.split())
    # Keep first 2 sentences for readability
    sentences = re.split(r"(?<=[.!?])\s+", section)
    return " ".join(sentences[:2]).strip()


def _extract_actions(text: str) -> str:
    """Extract and compact top recommendation lines."""
    plain = text.replace("*", "")
    idx = plain.find("Recommended Actions:")
    if idx == -1:
        return ""

    tail = plain[idx + len("Recommended Actions:"):].strip().splitlines()
    lines = [ln.strip() for ln in tail if ln.strip()]
    action_lines = [ln for ln in lines if re.match(r"^\d+\.", ln)]
    if not action_lines:
        return ""

    return "\n".join(action_lines[:3])


def _as_currency(raw: Optional[str]) -> str:
    if not raw:
        return "—"
    cleaned = raw.replace(",", "").replace("$", "").strip()
    try:
        return f"${float(cleaned):,.2f}"
    except Exception:
        return raw


def _to_number(raw: Optional[str]) -> float:
    if not raw:
        return 0.0
    cleaned = raw.replace(",", "").replace("$", "").strip()
    try:
        return float(cleaned)
    except Exception:
        return 0.0


def _trend_emoji(snapshot: dict[str, str], forecast: str) -> str:
    net = _to_number(snapshot.get("net_new_mrr"))
    if net > 0:
        return "📈"
    if net < 0:
        return "📉"
    f = forecast.lower()
    if "increase" in f or "improv" in f:
        return "📈"
    if "declin" in f or "decrease" in f:
        return "📉"
    return "➡️"


def _trend_label(snapshot: dict[str, str], forecast: str) -> str:
    net = _to_number(snapshot.get("net_new_mrr"))
    if net > 0:
        return "Improving"
    if net < 0:
        return "Under pressure"
    f = forecast.lower()
    if "increase" in f or "improv" in f:
        return "Improving"
    if "declin" in f or "decrease" in f:
        return "Declining"
    return "Stable"


def _trend_color(snapshot: dict[str, str]) -> int:
    net = _to_number(snapshot.get("net_new_mrr"))
    if net > 0:
        return 0x22C55E  # green
    if net < 0:
        return 0xF97316  # orange
    return 0x5865F2      # blurple
