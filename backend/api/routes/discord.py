"""Discord interaction endpoint — handles slash commands from Discord."""
import csv
import io
import json
import logging
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

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

    response_text, csv_bytes, csv_filename = _format_state_for_discord(final_state, query)
    await _send_discord_followup(
        application_id,
        interaction_token,
        response_text,
        csv_bytes=csv_bytes,
        csv_filename=csv_filename,
    )


def _format_state_for_discord(
    state: dict | None,
    original_query: str,
) -> tuple[str, bytes | None, str | None]:
    """Format agent output into a Discord-friendly message."""
    if not state:
        return "No results returned.", None, None

    parts = [f"**Query:** {original_query}\n"]
    csv_bytes: bytes | None = None
    csv_filename: str | None = None

    if state.get("query_results"):
        query_results = state["query_results"]
        data_text, csv_bytes, csv_filename = _format_query_results_for_discord(query_results)
        parts.append(f"**📊 Data:**\n{data_text}")

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

    content = "\n".join(parts)
    if len(content) > 2000:
        content = content[:1997] + "..."
    return content, csv_bytes, csv_filename


def _format_query_results_for_discord(query_results: dict[str, Any]) -> tuple[str, bytes | None, str | None]:
    """Build compact Discord output with summary + top rows + optional CSV attachment."""
    columns = query_results.get("columns", []) or []
    rows = query_results.get("rows", []) or []
    row_count = int(query_results.get("row_count", len(rows)))
    if not columns or not rows:
        return "Query returned no results.", None, None

    sorted_rows = _sort_rows(rows, columns)
    display_rows = sorted_rows[:10]

    summary_lines = _build_summary(columns, sorted_rows, row_count)
    table_text = _render_compact_table(columns, display_rows)

    csv_bytes: bytes | None = None
    csv_filename: str | None = None
    if row_count > 10:
        csv_bytes = _rows_to_csv_bytes(columns, sorted_rows)
        csv_filename = f"revagent_query_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
        summary_lines.append(f"Attached CSV includes all {row_count} rows.")

    body = "\n".join(summary_lines)
    return f"{body}\n```text\n{table_text}\n```", csv_bytes, csv_filename


def _build_summary(columns: list[str], rows: list[dict[str, Any]], row_count: int) -> list[str]:
    lines = [f"Returned **{row_count}** row{'s' if row_count != 1 else ''}."]
    date_col = _find_date_column(columns)
    if date_col and rows:
        first = _format_date(rows[0].get(date_col))
        last = _format_date(rows[-1].get(date_col))
        if first and last:
            lines.append(f"Date range: **{last} -> {first}**.")

    # Churn-specific summary when these columns are present.
    churn_count_col = _find_column(columns, ("churned_count", "churn_count"))
    churn_mrr_col = _find_column(columns, ("churn_mrr",))
    if churn_count_col:
        churn_counts = [_to_float(r.get(churn_count_col)) for r in rows]
        total_churn_count = sum(churn_counts)
        lines.append(f"Total churn count: **{int(total_churn_count):,}**.")
        if rows:
            avg_daily = total_churn_count / len(rows)
            lines.append(f"Avg/day churn count: **{avg_daily:,.2f}**.")
        if date_col and rows:
            peak = max(churn_counts) if churn_counts else 0.0
            if peak > 0:
                peak_days = [
                    _format_date(r.get(date_col))
                    for r in rows
                    if _to_float(r.get(churn_count_col)) == peak and _format_date(r.get(date_col))
                ][:3]
                if peak_days:
                    lines.append(
                        f"Spike day(s): **{', '.join(peak_days)}** at **{int(peak):,}** churned."
                    )
    if churn_mrr_col:
        churn_mrr_values = [_to_float(r.get(churn_mrr_col)) for r in rows]
        total_churn_mrr = sum(churn_mrr_values)
        lines.append(f"Total churn MRR: **${total_churn_mrr:,.2f}**.")
        if rows:
            avg_daily_mrr = total_churn_mrr / len(rows)
            lines.append(f"Avg/day churn MRR: **${avg_daily_mrr:,.2f}**.")

    return lines


def _render_compact_table(columns: list[str], rows: list[dict[str, Any]]) -> str:
    headers = [_pretty_header(c) for c in columns]
    matrix = [[_format_cell(c, row.get(c)) for c in columns] for row in rows]
    widths = [len(h) for h in headers]
    for row in matrix:
        for i, cell in enumerate(row):
            widths[i] = min(max(widths[i], len(cell)), 20)

    def _truncate(value: str, max_len: int) -> str:
        if len(value) <= max_len:
            return value
        return value[: max_len - 3] + "..."

    def _line(values: list[str]) -> str:
        clipped = [_truncate(v, widths[i]) for i, v in enumerate(values)]
        return "| " + " | ".join(clipped[i].ljust(widths[i]) for i in range(len(clipped))) + " |"

    sep = "| " + " | ".join("-" * w for w in widths) + " |"
    lines = [_line(headers), sep]
    for row in matrix:
        lines.append(_line(row))
    return "\n".join(lines)


def _rows_to_csv_bytes(columns: list[str], rows: list[dict[str, Any]]) -> bytes:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({col: row.get(col) for col in columns})
    return buf.getvalue().encode("utf-8")


def _sort_rows(rows: list[dict[str, Any]], columns: list[str]) -> list[dict[str, Any]]:
    date_col = _find_date_column(columns)
    if not date_col:
        return rows

    def _key(row: dict[str, Any]):
        value = row.get(date_col)
        dt = _to_datetime(value)
        return dt or datetime.min

    return sorted(rows, key=_key, reverse=True)


def _find_date_column(columns: list[str]) -> str | None:
    for candidate in ("date", "timestamp", "created_at", "updated_at", "paid_at", "started_at", "canceled_at"):
        if candidate in columns:
            return candidate
    for col in columns:
        if "date" in col or col.endswith("_at"):
            return col
    return None


def _find_column(columns: list[str], candidates: tuple[str, ...]) -> str | None:
    lookup = {c.lower(): c for c in columns}
    for c in candidates:
        if c in lookup:
            return lookup[c]
    return None


def _to_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _format_date(value: Any) -> str | None:
    dt = _to_datetime(value)
    if not dt:
        return None
    return f"{dt.month}/{dt.day}/{dt.year}"


def _to_float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(str(value))
    except ValueError:
        return 0.0


def _pretty_header(col: str) -> str:
    return col.replace("_", " ").title()


def _format_cell(column: str, value: Any) -> str:
    if value is None:
        return "—"

    dt = _to_datetime(value)
    if dt:
        return f"{dt.month}/{dt.day}/{dt.year}"

    lower_col = column.lower()
    if isinstance(value, (int, float, Decimal)):
        numeric = float(value)
        if any(k in lower_col for k in ("mrr", "arr", "revenue", "amount", "arpu", "price", "cost")):
            return f"${numeric:,.2f}"
        if abs(numeric - int(numeric)) < 1e-9:
            return f"{int(numeric):,}"
        return f"{numeric:,.2f}"

    return str(value)


async def _send_discord_followup(
    application_id: str,
    interaction_token: str,
    content: str,
    csv_bytes: bytes | None = None,
    csv_filename: str | None = None,
):
    """Post a follow-up message to Discord after the deferred response."""
    import httpx

    url = f"https://discord.com/api/v10/webhooks/{application_id}/{interaction_token}"
    payload = {"content": content}

    try:
        async with httpx.AsyncClient() as client:
            if csv_bytes and csv_filename:
                form_payload = {"payload_json": json.dumps(payload)}
                files = {"files[0]": (csv_filename, csv_bytes, "text/csv")}
                resp = await client.post(url, data=form_payload, files=files, timeout=20)
            else:
                resp = await client.post(url, json=payload, timeout=10)
            resp.raise_for_status()
    except Exception as e:
        logger.error(f"[Discord] Follow-up post failed: {e}")
