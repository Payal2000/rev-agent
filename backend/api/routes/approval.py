"""Human-in-the-loop approval endpoint — resumes interrupted LangGraph."""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.dependencies import TenantDep
from graph.graph import get_graph

logger = logging.getLogger(__name__)
router = APIRouter()


class ApprovalDecision(BaseModel):
    approved: bool
    modified_action: Optional[str] = None   # optional human override of first recommendation
    rejection_reason: Optional[str] = None


@router.post("/approve/{session_id}")
async def approve_recommendation(
    session_id: str,
    decision: ApprovalDecision,
    tenant: TenantDep,
):
    """
    Resume a LangGraph run that is paused at the Action Agent interrupt.
    The graph was checkpointed to PostgreSQL — this call loads it and resumes.
    """
    config = {
        "configurable": {
            "thread_id": session_id,
            "tenant_id": tenant.id,
        }
    }

    graph = await get_graph()

    resume_value = {
        "approved": decision.approved,
        "modified_action": decision.modified_action,
        "rejection_reason": decision.rejection_reason,
    }

    logger.info(
        f"[Approval] Session {session_id}: approved={decision.approved}"
        + (f", reason={decision.rejection_reason}" if decision.rejection_reason else "")
    )

    try:
        from langgraph.types import Command

        # Resume the graph from the interrupt point and drain the stream
        async for _ in graph.astream(
            Command(resume=resume_value),
            config=config,
            stream_mode="updates",
        ):
            pass

        # Extract the final AI message from the completed graph state
        final_message: Optional[str] = None
        try:
            snapshot = await graph.aget_state(config)
            if snapshot and snapshot.values:
                for msg in reversed(snapshot.values.get("messages", [])):
                    cls = getattr(msg, "__class__", type(msg)).__name__
                    if "AIMessage" in cls and getattr(msg, "content", ""):
                        final_message = msg.content
                        break
        except Exception as state_err:
            logger.warning(f"[Approval] Could not read final state: {state_err}")

        return {
            "status": "resumed",
            "session_id": session_id,
            "approved": decision.approved,
            "message": final_message,
        }

    except Exception as e:
        logger.error(f"[Approval] Failed to resume session {session_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to resume: {e}")


@router.get("/approval/{session_id}/status")
async def get_approval_status(session_id: str, tenant: TenantDep):
    """Check whether a session is currently awaiting human approval."""
    config = {
        "configurable": {
            "thread_id": session_id,
            "tenant_id": tenant.id,
        }
    }

    graph = await get_graph()

    try:
        state = await graph.aget_state(config)
        if state and state.values:
            return {
                "session_id": session_id,
                "awaiting_approval": state.values.get("awaiting_approval", False),
                "approval_context": state.values.get("approval_context"),
                "recommendations": state.values.get("recommendations", []),
            }
        return {"session_id": session_id, "awaiting_approval": False}
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Session not found: {e}")
