"""Chat route — SSE streaming endpoint for the agent pipeline."""
import json
import logging
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage, AIMessage
from pydantic import BaseModel
from sqlalchemy.dialects.postgresql import insert as pg_insert

from api.dependencies import TenantDep
from config import settings
from data.database import AsyncSessionLocal
from data.models import ChatSession
from graph.graph import get_graph
from llm import get_async_openai

logger = logging.getLogger(__name__)
router = APIRouter()


async def _upsert_session(session_id: str, company_id: str, title: str) -> None:
    """Insert or update a ChatSession record (upsert on session_id)."""
    try:
        async with AsyncSessionLocal() as db:
            stmt = (
                pg_insert(ChatSession)
                .values(
                    session_id=session_id,
                    company_id=company_id,
                    title=title[:200],
                )
                .on_conflict_do_update(
                    index_elements=["session_id"],
                    set_={"updated_at": ChatSession.updated_at},
                )
            )
            await db.execute(stmt)
            await db.commit()
    except Exception as e:
        logger.warning(f"[Chat] Failed to upsert session: {e}")


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


@router.post("/chat")
async def chat(
    request: ChatRequest,
    tenant: TenantDep,
):
    """
    Stream the agent pipeline response token-by-token via SSE.
    Each event is a JSON object: {type, content/data}
    Event types: token | step | approval_required | done | error
    """
    session_id = request.session_id or str(uuid.uuid4())

    # Persist session so history can be listed/restored
    await _upsert_session(session_id, tenant.id, request.message)

    config = {
        "configurable": {
            "thread_id": session_id,
            "tenant_id": tenant.id,
        }
    }

    graph = await get_graph()

    initial_state = {
        "messages": [HumanMessage(content=request.message)],
        "tenant_id": tenant.id,
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
        "audit_trace_id": str(uuid.uuid4()),
        "error": None,
        "retry_count": 0,
    }

    return StreamingResponse(
        _stream_agent(graph, initial_state, config, session_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )


async def _stream_agent(
    graph,
    initial_state: dict,
    config: dict,
    session_id: str,
) -> AsyncGenerator[str, None]:
    """Yield SSE events from the LangGraph stream."""

    def sse_event(event_type: str, data: dict) -> str:
        return f"data: {json.dumps({'type': event_type, **data})}\n\n"

    try:
        async for event in graph.astream_events(
            initial_state,
            config=config,
            version="v2",
        ):
            event_name = event.get("event", "")
            event_data = event.get("data", {})
            node_name = event.get("name", "")

            # Token streaming from LLM
            if event_name == "on_chat_model_stream":
                chunk = event_data.get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    yield sse_event("token", {"content": chunk.content})

            # Agent step updates
            elif event_name == "on_chain_start" and node_name in {
                "supervisor", "query", "insights", "forecast", "action", "validator"
            }:
                step_labels = {
                    "supervisor": "Classifying intent...",
                    "query": "Generating SQL and querying data...",
                    "insights": "Analyzing anomalies...",
                    "forecast": "Computing forecast...",
                    "action": "Generating recommendations...",
                    "validator": "Validating outputs...",
                }
                yield sse_event("step", {
                    "agent": node_name,
                    "label": step_labels.get(node_name, node_name)
                })

    except Exception as e:
        logger.error(f"[Chat] Stream error: {e}", exc_info=True)
        yield sse_event("error", {"message": str(e)})
        yield sse_event("done", {"session_id": session_id})
        return

    # Check if the graph paused at a human-in-the-loop interrupt
    try:
        snapshot = await graph.aget_state(config)
        if snapshot and snapshot.next and snapshot.tasks:
            for task in snapshot.tasks:
                if task.interrupts:
                    interrupt_value = task.interrupts[0].value
                    yield sse_event("approval_required", {
                        "session_id": session_id,
                        "context": interrupt_value,
                    })
                    yield sse_event("done", {"session_id": session_id})
                    return
    except Exception as e:
        logger.warning(f"[Chat] Failed to check interrupt state: {e}")

    # After graph completes, synthesize final response from state
    try:
        snapshot = await graph.aget_state(config)
        if snapshot:
            sv = snapshot.values

            # Emit chart event if query results are chart-worthy
            qr = sv.get("query_results")
            if qr:
                chart = _detect_chart(qr)
                if chart:
                    yield sse_event("chart", chart)

            # Check for an AIMessage added by HITL approval aggregation
            # (supervisor._aggregate_final_response adds one after human approves)
            # We only use it if it was added AFTER the last HumanMessage in state
            hitl_response = None
            found_human = False
            for msg in reversed(sv.get("messages", [])):
                cls = getattr(msg, "__class__", type(msg)).__name__
                if "HumanMessage" in cls:
                    found_human = True
                    break
                if "AIMessage" in cls and getattr(msg, "content", "") and not found_human:
                    hitl_response = msg.content
                    break

            # Only use hitl_response if recommendations exist (true HITL flow)
            if hitl_response and sv.get("recommendations"):
                yield sse_event("token", {"content": hitl_response})
            else:
                narrative = await _synthesize_response(sv)
                yield sse_event("token", {"content": narrative})
                # Persist AI response back into LangGraph checkpoint
                try:
                    await graph.aupdate_state(config, {"messages": [AIMessage(content=narrative)]})
                except Exception as save_err:
                    logger.warning(f"[Chat] Failed to save AI response to checkpoint: {save_err}")
    except Exception as e:
        logger.error(f"[Chat] Failed to synthesize final response: {e}")

    yield sse_event("done", {"session_id": session_id})


async def _synthesize_response(sv: dict) -> str:
    """
    Use GPT-4o-mini to generate a clean, business-friendly markdown response
    from the agent state. Falls back to a structured text summary if LLM fails.
    """
    # Extract the user's original question and recent conversation history
    user_question = ""
    conversation_history = []
    for msg in reversed(sv.get("messages", [])):
        cls = msg.__class__.__name__
        if "HumanMessage" in cls and getattr(msg, "content", "") and not user_question:
            user_question = msg.content
        elif "AIMessage" in cls and getattr(msg, "content", ""):
            conversation_history.insert(0, f"Assistant: {msg.content[:300]}")
        elif "HumanMessage" in cls and getattr(msg, "content", ""):
            conversation_history.insert(0, f"User: {msg.content}")

    qr = sv.get("query_results")
    fc = sv.get("forecast")
    anomalies = sv.get("anomalies") or []
    error = sv.get("error")

    # Build context for the LLM
    context_parts = []

    if qr:
        formatted = qr.get("formatted", "")
        if formatted:
            context_parts.append(f"Query results:\n{formatted}")
        elif qr.get("row_count"):
            context_parts.append(f"Query returned {qr['row_count']} rows.")

    for a in anomalies:
        context_parts.append(f"Anomaly detected: {a.get('explanation', '')}")

    if fc and fc.get("narrative"):
        context_parts.append(f"Forecast: {fc['narrative']}")

    if error:
        context_parts.append(f"Error: {error}")

    # Handle explicit clarification requests from the query agent
    if error and error.startswith("CLARIFICATION_NEEDED:"):
        return error.replace("CLARIFICATION_NEEDED:", "").strip()

    if not context_parts:
        return "I completed the analysis but found no data matching your query. Try asking about MRR, churn, subscriptions, or revenue trends."

    context = "\n\n".join(context_parts)

    history_block = ""
    if conversation_history:
        history_block = "\n\nRecent conversation context:\n" + "\n".join(conversation_history[-6:])

    prompt = f"""You are a SaaS revenue analyst assistant. The user asked: "{user_question}"{history_block}

Here is the data retrieved:
{context}

Write a concise, business-friendly response in markdown. Guidelines:
- Start with a 1-2 sentence summary answering the question directly
- If there's a data table, include it as-is (preserve the markdown table)
- Add 1-2 bullet points with the most actionable insight from the data
- Keep total response under 200 words
- Do NOT repeat the raw table header introduction — just include the table directly
- Use **bold** for key numbers or important phrases
- Use conversation context to make the response more relevant and specific"""

    try:
        oai = get_async_openai()
        resp = await oai.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=500,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        logger.warning(f"[Chat] LLM synthesis failed, using fallback: {e}")
        # Fallback: return structured text
        return context


def _serialize_rows(rows: list) -> list:
    """Convert any non-JSON-serializable values to JSON-safe types."""
    import json
    from datetime import date, datetime as dt
    from decimal import Decimal

    def _safe(v):
        if v is None:
            return 0
        if isinstance(v, bool):
            return v
        if isinstance(v, (int, float)):
            return v
        if isinstance(v, Decimal):
            return float(v)
        if isinstance(v, (dt, date)):
            s = str(v)[:10]  # "2024-03-01"
            return s[:7] if s.endswith("-01") else s  # "2024-03" for month-start dates
        # Catch-all: stringify anything else (UUID, enum, etc.)
        try:
            json.dumps(v)
            return v
        except (TypeError, ValueError):
            return str(v)

    return [{k: _safe(v) for k, v in row.items()} for row in rows]


def _detect_chart(query_results: dict) -> dict | None:
    """
    Inspect query_results and return a chart config if the data is chart-worthy.
    Returns None if data is not suitable for charting (too few rows, no numerics, etc.)
    """
    raw_rows = query_results.get("rows") or []
    if len(raw_rows) < 2:
        logger.debug(f"[Chart] Skipped — only {len(raw_rows)} row(s), need ≥2")
        return None

    rows = _serialize_rows(raw_rows)
    columns = list(rows[0].keys())

    # Separate numeric vs categorical columns
    numeric_cols = [
        c for c in columns
        if isinstance(rows[0].get(c), (int, float)) and rows[0].get(c) is not None
    ]
    cat_cols = [c for c in columns if c not in numeric_cols]

    if not numeric_cols:
        logger.debug(f"[Chart] Skipped — no numeric columns in {columns}")
        return None

    # Time series detection — line chart
    time_keywords = {"date", "month", "day", "week", "period", "year", "quarter", "time"}
    time_col = next(
        (c for c in cat_cols if any(kw in c.lower() for kw in time_keywords)),
        None
    )
    if time_col:
        logger.info(f"[Chart] line · x={time_col} y={numeric_cols[:3]} rows={len(rows)}")
        return {
            "chartType": "line",
            "data": rows,
            "xKey": time_col,
            "yKeys": numeric_cols[:3],
        }

    # Categorical — pie if ≤6 rows and single numeric, else bar
    if cat_cols:
        x_key = cat_cols[0]
        if len(rows) <= 6 and len(numeric_cols) == 1:
            logger.info(f"[Chart] pie · x={x_key} y={numeric_cols[0]} rows={len(rows)}")
            return {
                "chartType": "pie",
                "data": rows,
                "xKey": x_key,
                "yKeys": numeric_cols,
            }
        logger.info(f"[Chart] bar · x={x_key} y={numeric_cols[:3]} rows={len(rows)}")
        return {
            "chartType": "bar",
            "data": rows,
            "xKey": x_key,
            "yKeys": numeric_cols[:3],
        }

    logger.debug(f"[Chart] Skipped — no categorical x-axis found in {columns}")
    return None
