"""Chat history endpoints — list sessions and restore messages."""
import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import TenantDep, get_db_with_tenant
from data.models import ChatSession
from graph.graph import get_graph

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/chat/sessions")
async def list_sessions(
    tenant: TenantDep,
    db: AsyncSession = Depends(get_db_with_tenant),
):
    """Return the 50 most recent chat sessions for this tenant."""
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.company_id == tenant.id)
        .order_by(ChatSession.updated_at.desc())
        .limit(50)
    )
    sessions = result.scalars().all()
    return [
        {
            "session_id": s.session_id,
            "title": s.title,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        }
        for s in sessions
    ]


@router.delete("/chat/sessions/{session_id}")
async def delete_session(
    session_id: str,
    tenant: TenantDep,
    db: AsyncSession = Depends(get_db_with_tenant),
):
    """Delete a chat session record (does not delete the LangGraph checkpoint)."""
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.session_id == session_id,
            ChatSession.company_id == tenant.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    return {"ok": True}


@router.get("/chat/sessions/{session_id}/messages")
async def get_session_messages(session_id: str, tenant: TenantDep):
    """Restore messages for a session from the LangGraph checkpoint."""
    graph = await get_graph()
    config = {"configurable": {"thread_id": session_id, "tenant_id": tenant.id}}

    try:
        snapshot = await graph.aget_state(config)
    except Exception as e:
        logger.warning(f"[ChatHistory] Could not load state for {session_id}: {e}")
        return {"messages": []}

    if not snapshot:
        return {"messages": []}

    messages = []
    for msg in snapshot.values.get("messages", []):
        cls = msg.__class__.__name__
        if "HumanMessage" in cls and getattr(msg, "content", ""):
            messages.append({"role": "user", "content": msg.content})
        elif "AIMessage" in cls and getattr(msg, "content", ""):
            messages.append({"role": "assistant", "content": msg.content})

    return {"messages": messages}
