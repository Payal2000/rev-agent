"""Slack event & interaction endpoints — slash commands and button callbacks."""
import hashlib
import hmac
import json
import logging
import time
import uuid
from typing import Optional
from urllib.parse import parse_qs

from fastapi import APIRouter, HTTPException, Request, Response
from langchain_core.messages import HumanMessage

from config import settings
from tools.slack_tools import get_slack_client

logger = logging.getLogger(__name__)
router = APIRouter()


def _verify_slack_signature(body: bytes, timestamp: str, signature: str) -> bool:
    """Verify Slack request signature using HMAC-SHA256."""
    if not settings.slack_signing_secret:
        logger.warning("SLACK_SIGNING_SECRET not set — skipping signature verification")
        return True

    # Reject requests older than 5 minutes (replay attack prevention)
    if abs(time.time() - float(timestamp)) > 300:
        return False

    base_string = f"v0:{timestamp}:{body.decode('utf-8')}"
    expected = "v0=" + hmac.new(
        settings.slack_signing_secret.encode(),
        base_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


@router.post("/slack/events")
async def slack_events(request: Request):
    """
    Handles Slack slash commands and event subscriptions.
    Supports: /revagent <query>
    """
    body = await request.body()
    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
    signature = request.headers.get("X-Slack-Signature", "")

    if not _verify_slack_signature(body, timestamp, signature):
        raise HTTPException(status_code=401, detail="Invalid Slack signature")

    content_type = request.headers.get("content-type", "")

    # Slash commands come as application/x-www-form-urlencoded
    if "application/x-www-form-urlencoded" in content_type:
        form = parse_qs(body.decode("utf-8"))

        def _f(key: str) -> str:
            return form.get(key, [""])[0]

        command = _f("command")
        text = _f("text").strip()
        response_url = _f("response_url")
        channel_id = _f("channel_id")
        user_id = _f("user_id")
        team_id = _f("team_id")

        if command == "/revagent":
            if not text:
                return {
                    "response_type": "ephemeral",
                    "text": "Please provide a query. Example: `/revagent What is our MRR this month?`",
                }

            company_id = _get_company_id_for_team(team_id)

            # Ack immediately — Slack requires response within 3 seconds
            import asyncio
            asyncio.create_task(
                _run_agent_and_respond(text, company_id, response_url, channel_id, user_id)
            )

            return {
                "response_type": "in_channel",
                "text": f"🔍 Analyzing: _{text}_\nResults coming up...",
            }

    # Event subscription (JSON body)
    if "application/json" in content_type:
        data = await request.json()

        # URL verification challenge from Slack
        if data.get("type") == "url_verification":
            return {"challenge": data["challenge"]}

    return Response(status_code=204)


@router.post("/slack/interactions")
async def slack_interactions(request: Request):
    """
    Handles Slack interactive component callbacks (button clicks).
    Wires the approval/rejection buttons back into LangGraph.
    """
    body = await request.body()
    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
    signature = request.headers.get("X-Slack-Signature", "")

    if not _verify_slack_signature(body, timestamp, signature):
        raise HTTPException(status_code=401, detail="Invalid Slack signature")

    form = parse_qs(body.decode("utf-8"))
    payload_str = form.get("payload", ["{}"])[0]
    payload = json.loads(payload_str)

    action_id = payload.get("actions", [{}])[0].get("action_id", "")
    value = payload.get("actions", [{}])[0].get("value", "")
    response_url = payload.get("response_url", "")

    # Approval/rejection button from an Action Agent recommendation
    if action_id in ("approve_recommendation", "reject_recommendation"):
        session_id = value  # we encode session_id as the button value
        approved = action_id == "approve_recommendation"

        import asyncio
        asyncio.create_task(
            _handle_approval(session_id, approved, response_url)
        )

        return {
            "response_type": "in_channel",
            "text": f"{'✅ Approved' if approved else '❌ Rejected'} — processing...",
        }

    return Response(status_code=204)


def _get_company_id_for_team(team_id: str) -> str:
    """Map Slack workspace ID to a company_id. Falls back to demo tenant."""
    # In production, look this up from a workspace→company mapping table
    return "00000000-0000-0000-0000-000000000001"


async def _run_agent_and_respond(
    query: str,
    company_id: str,
    response_url: str,
    channel_id: str,
    user_id: str,
):
    """Run the LangGraph pipeline and post the result back to Slack."""
    import httpx
    from graph.graph import get_graph

    graph = await get_graph()
    session_id = f"slack-{uuid.uuid4()}"

    initial_state = {
        "messages": [HumanMessage(content=query)],
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

    final_state = None
    try:
        async for state in graph.astream(initial_state, config=config, stream_mode="values"):
            final_state = state
    except Exception as e:
        logger.error(f"[Slack] Agent pipeline failed: {e}", exc_info=True)
        await _post_to_response_url(response_url, {"text": f"❌ Error running analysis: {e}"})
        return

    blocks = _format_state_as_blocks(final_state, query, session_id)
    await _post_to_response_url(response_url, {"blocks": blocks, "response_type": "in_channel"})


def _format_state_as_blocks(state: dict | None, original_query: str, session_id: str) -> list:
    """Format agent output as Slack Block Kit blocks."""
    if not state:
        return [{"type": "section", "text": {"type": "mrkdwn", "text": "No results returned."}}]

    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": "📊 RevAgent Analysis"},
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Query:* {original_query}"},
        },
        {"type": "divider"},
    ]

    if state.get("query_results"):
        formatted = state["query_results"].get("formatted", "")
        if formatted:
            blocks.append({
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*Data:*\n```{formatted[:2800]}```"},
            })

    if state.get("anomalies"):
        anomalies = state["anomalies"]
        anomaly_lines = "\n".join(
            f"• *{a['metric_name']}* ({a['severity'].upper()}): {a['explanation'][:150]}"
            for a in anomalies[:3]
        )
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*⚠️ Anomalies ({len(anomalies)}):*\n{anomaly_lines}"},
        })

    if state.get("forecast"):
        fc = state["forecast"]
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*📈 Forecast:*\n{fc.get('narrative', '')[:400]}"},
        })

    if state.get("recommendations"):
        rec_lines = "\n".join(
            f"{r['rank']}. *{r['title']}* — {r['estimated_impact']}"
            for r in state["recommendations"][:3]
        )
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*💡 Recommendations:*\n{rec_lines}"},
        })

    # If the graph is paused awaiting approval, show approve/reject buttons
    if state.get("awaiting_approval"):
        blocks.append({"type": "divider"})
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": "⏸ *This action requires your approval:*"},
        })
        blocks.append({
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "✅ Approve"},
                    "style": "primary",
                    "action_id": "approve_recommendation",
                    "value": session_id,
                },
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "❌ Reject"},
                    "style": "danger",
                    "action_id": "reject_recommendation",
                    "value": session_id,
                },
            ],
        })

    return blocks


async def _handle_approval(session_id: str, approved: bool, response_url: str):
    """Resume a LangGraph run from a Slack approval button click."""
    from graph.graph import get_graph
    from langgraph.types import Command

    graph = await get_graph()
    config = {"configurable": {"thread_id": session_id}}

    resume_value = {"approved": approved, "modified_action": None, "rejection_reason": None}

    try:
        async for _ in graph.astream(
            Command(resume=resume_value),
            config=config,
            stream_mode="updates",
        ):
            pass

        msg = "✅ Action approved and executed." if approved else "❌ Action rejected."
        await _post_to_response_url(response_url, {"text": msg, "response_type": "in_channel"})

    except Exception as e:
        logger.error(f"[Slack] Approval resume failed for {session_id}: {e}")
        await _post_to_response_url(response_url, {"text": f"❌ Failed to process approval: {e}"})


async def _post_to_response_url(response_url: str, payload: dict):
    """Post a delayed response back to Slack via response_url."""
    import httpx

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(response_url, json=payload, timeout=10)
            resp.raise_for_status()
    except Exception as e:
        logger.error(f"[Slack] response_url post failed: {e}")
