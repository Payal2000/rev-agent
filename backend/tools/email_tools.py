"""Email tools — SendGrid sender usable as a LangChain @tool or standalone function."""
import logging
from typing import Optional

from langchain_core.tools import tool
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Content

from config import settings

logger = logging.getLogger(__name__)


# ── LangChain @tool — usable by the Action Agent ──────────────────────────────

@tool
def send_alert_email(to_email: str, subject: str, body: str) -> str:
    """
    Send an email alert to a user about a revenue anomaly, forecast, or recommendation.
    Use this when the analysis reveals a critical issue that warrants direct notification.
    Args:
        to_email: Recipient email address.
        subject: Email subject line.
        body: Plain text email body with the analysis details.
    """
    success = _send_via_sendgrid(to_email, subject, body)
    if success:
        return f"Email sent to {to_email}"
    return f"Failed to send email to {to_email} — check SENDGRID_API_KEY configuration"


# ── Standalone functions — used by Celery scheduled tasks ─────────────────────

async def send_daily_briefing_email(
    briefing_text: str,
    to_email: Optional[str] = None,
) -> bool:
    """Send the daily revenue briefing via email."""
    recipient = to_email or settings.alert_email
    if not recipient:
        logger.warning("No alert_email configured — skipping email briefing")
        return False

    html_body = _briefing_text_to_html(briefing_text)
    return _send_via_sendgrid(
        to_email=recipient,
        subject="📊 Daily Revenue Briefing — RevAgent",
        body=briefing_text,
        html_body=html_body,
    )


async def send_anomaly_alert_email(
    metric_name: str,
    explanation: str,
    severity: str,
    z_score: float,
    to_email: Optional[str] = None,
) -> bool:
    """Send an anomaly alert email."""
    recipient = to_email or settings.alert_email
    if not recipient:
        logger.warning("No alert_email configured — skipping anomaly email")
        return False

    severity_emoji = {"low": "🟡", "medium": "🟠", "high": "🔴", "critical": "🚨"}.get(severity, "⚠️")
    subject = f"{severity_emoji} Revenue Anomaly: {metric_name} ({severity.upper()})"

    body = (
        f"A revenue anomaly has been detected.\n\n"
        f"Metric: {metric_name}\n"
        f"Severity: {severity.upper()}\n"
        f"Z-Score: {z_score:.2f}σ\n\n"
        f"Analysis:\n{explanation}\n\n"
        f"Log in to RevAgent to view full details and recommendations."
    )

    return _send_via_sendgrid(recipient, subject, body)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _send_via_sendgrid(
    to_email: str,
    subject: str,
    body: str,
    html_body: Optional[str] = None,
    from_email: Optional[str] = None,
) -> bool:
    """Send email via SendGrid. Returns True on success."""
    if not settings.sendgrid_api_key:
        logger.warning("SendGrid not configured — skipping email")
        return False

    sender = from_email or settings.sendgrid_from_email
    message = Mail(from_email=sender, to_emails=to_email, subject=subject)
    message.add_content(Content("text/plain", body))

    if html_body:
        message.add_content(Content("text/html", html_body))

    try:
        sg = SendGridAPIClient(api_key=settings.sendgrid_api_key)
        response = sg.send(message)
        logger.info(f"Email sent to {to_email} — status {response.status_code}")
        return response.status_code in (200, 202)
    except Exception as e:
        logger.error(f"SendGrid error: {e}")
        return False


def _briefing_text_to_html(text: str) -> str:
    """Convert the plain-text briefing to a minimal HTML email."""
    lines = text.split("\n")
    html_lines = []
    for line in lines:
        if line.startswith("*") and line.endswith("*"):
            html_lines.append(f"<h3>{line.strip('*')}</h3>")
        elif line.startswith("•"):
            html_lines.append(f"<li>{line[1:].strip()}</li>")
        elif line.strip():
            html_lines.append(f"<p>{line}</p>")

    body_content = "\n".join(html_lines)
    return f"""
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px;">
  <h2 style="color: #1a1a2e;">📊 Daily Revenue Briefing</h2>
  {body_content}
  <hr style="margin-top: 32px;" />
  <p style="color: #888; font-size: 12px;">Sent by RevAgent · Revenue Intelligence Platform</p>
</body>
</html>
"""
