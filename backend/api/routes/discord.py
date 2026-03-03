"""Discord interaction endpoint — handles slash commands from Discord."""
import hashlib
import hmac
import logging
import time
import uuid

from fastapi import APIRouter, HTTPException, Request, Response
from langchain_core.messages import HumanMessage

from config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Discord interaction types
INTERACTION_TYPE_PING = 1
INTERACTION_TYPE_APPLICATION_COMMAND = 2

# Discord response types
RESPONSE_TYPE_PONG = 1
RESPONSE_TYPE_CHANNEL_MESSAGE = 4
RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE = 5  # "Bot is thinking..."


def _verify_discord_signature(body: bytes, signature: str, timestamp: str) -> bool:
    """Verify the Discord Ed25519 request signature."""
    if not settings.discord_public_key:
        logger.warning("DISCORD_PUBLIC_KEY not set — skipping signature verification")
        return True

    try:
        from nacl.signing import VerifyKey
        from nacl.exceptions import BadSignatureError

        verify_key = VerifyKey(bytes.fromhex(settings.discord_public_key))
        verify_key.verify(
            (timestamp + body.decode("utf-8")).encode(),
            bytes.fromhex(signature),
        )
        return True
    except Exception:
        return False


@router.post("/discord/interactions")
async def discord_interactions(request: Request):
    """
    Receives Discord interactions (slash commands).
    Discord requires a verified HTTP endpoint — this handles:
    - PING (Discord connectivity check)
    - /revagent <query> application command
    """
    body = await request.body()
    signature = request.headers.get("X-Signature-Ed25519", "")
    timestamp = request.headers.get("X-Signature-Timestamp", "")

    # Discord requires signature verification — reject invalid requests
    if not _verify_discord_signature(body, signature, timestamp):
        raise HTTPException(status_code=401, detail="Invalid request signature")

    data = await request.json()
    interaction_type = data.get("type")

    # Discord connectivity ping — must respond with PONG
    if interaction_type == INTERACTION_TYPE_PING:
        return {"type": RESPONSE_TYPE_PONG}

    # Slash command
    if interaction_type == INTERACTION_TYPE_APPLICATION_COMMAND:
        command_name = data.get("data", {}).get("name", "")

        if command_name == "revagent":
            options = data.get("data", {}).get("options", [])
            query = next((o["value"] for o in options if o["name"] == "query"), "")

            if not query:
                return {
                    "type": RESPONSE_TYPE_CHANNEL_MESSAGE,
                    "data": {"content": "Please provide a query. Example: `/revagent What is our MRR this month?`"},
                }

            # Ack immediately — Discord requires response within 3 seconds
            # Actual agent response is sent via follow-up webhook
            interaction_token = data.get("token")
            application_id = data.get("application_id")
            guild_id = data.get("guild_id", "")

            # Extract company_id from guild mapping or fall back to demo
            company_id = _get_company_id_for_guild(guild_id)

            # Run agent pipeline in background, send follow-up to Discord
            import asyncio
            asyncio.create_task(
                _run_agent_and_followup(query, company_id, application_id, interaction_token)
            )

            return {
                "type": RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE,
                "data": {"flags": 0},  # public response
            }

    return Response(status_code=204)


def _get_company_id_for_guild(guild_id: str) -> str:
    """Map Discord guild ID to a company_id. Falls back to demo tenant."""
    # In production, look this up from a guild→company mapping table
    return "00000000-0000-0000-0000-000000000001"


async def _run_agent_and_followup(
    query: str,
    company_id: str,
    application_id: str,
    interaction_token: str,
):
    """Run the LangGraph pipeline and post the result back to Discord as a follow-up."""
    from graph.graph import get_graph

    graph = await get_graph()
    session_id = f"discord-{uuid.uuid4()}"

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
        logger.error(f"[Discord] Agent pipeline failed: {e}", exc_info=True)
        await _send_discord_followup(
            application_id, interaction_token, f"❌ Error running analysis: {e}"
        )
        return

    response_text = _format_state_for_discord(final_state, query)
    await _send_discord_followup(application_id, interaction_token, response_text)


def _format_state_for_discord(state: dict | None, original_query: str) -> str:
    """Format agent output into a Discord-friendly message."""
    if not state:
        return "No results returned."

    parts = [f"**Query:** {original_query}\n"]

    if state.get("query_results"):
        formatted = state["query_results"].get("formatted", "")
        if formatted:
            parts.append(f"**📊 Data:**\n```\n{formatted[:800]}\n```")

    if state.get("anomalies"):
        anomalies = state["anomalies"]
        parts.append(f"**⚠️ Anomalies ({len(anomalies)} detected):**")
        for a in anomalies[:3]:
            parts.append(f"• **{a['metric_name']}** ({a['severity'].upper()}): {a['explanation'][:200]}")

    if state.get("forecast"):
        fc = state["forecast"]
        parts.append(f"**📈 Forecast:**\n{fc.get('narrative', '')[:400]}")

    if state.get("recommendations"):
        parts.append("**💡 Recommendations:**")
        for rec in state["recommendations"][:3]:
            parts.append(f"{rec['rank']}. **{rec['title']}** — {rec['estimated_impact']}")

    if state.get("awaiting_approval"):
        parts.append(
            "\n⏸ *This action requires approval. Visit the RevAgent dashboard to approve or reject.*"
        )

    if state.get("error") and not parts[1:]:
        parts.append(f"❌ {state['error']}")

    return "\n".join(parts)[:2000]  # Discord message limit


async def _send_discord_followup(application_id: str, interaction_token: str, content: str):
    """Post a follow-up message to Discord after the deferred response."""
    import httpx

    url = f"https://discord.com/api/v10/webhooks/{application_id}/{interaction_token}"
    payload = {"content": content}

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, timeout=10)
            resp.raise_for_status()
    except Exception as e:
        logger.error(f"[Discord] Follow-up post failed: {e}")
