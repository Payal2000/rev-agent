"""Slack notification sender for anomaly alerts and daily briefings."""
import logging
from typing import Optional

from slack_sdk.web.async_client import AsyncWebClient
from slack_sdk.errors import SlackApiError

from config import settings

logger = logging.getLogger(__name__)

_slack_client: Optional[AsyncWebClient] = None


def get_slack_client() -> AsyncWebClient:
    global _slack_client
    if _slack_client is None:
        _slack_client = AsyncWebClient(token=settings.slack_bot_token)
    return _slack_client


async def send_anomaly_alert(
    metric_name: str,
    explanation: str,
    severity: str,
    z_score: float,
    channel_id: Optional[str] = None,
) -> bool:
    """Send an anomaly alert to Slack."""
    if not settings.slack_bot_token:
        logger.warning("Slack not configured — skipping notification")
        return False

    severity_emoji = {"low": "🟡", "medium": "🟠", "high": "🔴", "critical": "🚨"}.get(severity, "⚠️")
    channel = channel_id or settings.slack_channel_id

    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"{severity_emoji} Revenue Anomaly Detected"}
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Metric:* {metric_name}"},
                {"type": "mrkdwn", "text": f"*Severity:* {severity.upper()}"},
                {"type": "mrkdwn", "text": f"*Z-Score:* {z_score:.2f}σ"},
            ]
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Analysis:*\n{explanation}"}
        },
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "View in RevAgent"},
                    "url": "http://localhost:3000",
                    "style": "primary"
                }
            ]
        }
    ]

    try:
        client = get_slack_client()
        await client.chat_postMessage(channel=channel, blocks=blocks, text=f"Anomaly: {metric_name}")
        return True
    except SlackApiError as e:
        logger.error(f"Slack send failed: {e.response['error']}")
        return False


async def send_daily_briefing(briefing_text: str, channel_id: Optional[str] = None) -> bool:
    """Send the daily revenue briefing to Slack."""
    if not settings.slack_bot_token:
        return False

    channel = channel_id or settings.slack_channel_id

    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": "📊 Daily Revenue Briefing"}
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": briefing_text[:3000]}  # Slack block limit
        }
    ]

    try:
        client = get_slack_client()
        await client.chat_postMessage(channel=channel, blocks=blocks, text="Daily Revenue Briefing")
        return True
    except SlackApiError as e:
        logger.error(f"Slack briefing failed: {e.response['error']}")
        return False
