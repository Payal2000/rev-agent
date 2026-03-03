"""Discord notification sender for anomaly alerts and daily briefings."""
import logging
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

    payload = {
        "embeds": [
            {
                "title": "📊 Daily Revenue Briefing",
                "description": briefing_text[:4096],  # Discord embed limit
                "color": 0x5865F2,  # Discord blurple
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
