"""Chat route — SSE streaming endpoint for the agent pipeline."""
import json
import logging
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from pydantic import BaseModel

from api.dependencies import TenantDep
from graph.graph import get_graph

logger = logging.getLogger(__name__)
router = APIRouter()


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
        "audit_trace_id": None,
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

            # Human-in-the-loop approval required
            elif event_name == "on_chain_end" and node_name == "action":
                output = event_data.get("output", {})
                if isinstance(output, dict) and output.get("awaiting_approval"):
                    yield sse_event("approval_required", {
                        "session_id": session_id,
                        "context": output.get("approval_context", {}),
                    })

    except Exception as e:
        logger.error(f"[Chat] Stream error: {e}", exc_info=True)
        yield sse_event("error", {"message": str(e)})

    yield sse_event("done", {"session_id": session_id})
