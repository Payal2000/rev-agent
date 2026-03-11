"""Health check endpoints."""
from fastapi import APIRouter
from sqlalchemy import text

from config import settings
from data.database import engine
from llm import get_async_openai

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok", "service": "revagent-backend"}


@router.get("/health/db")
async def health_db():
    """Check database connectivity."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": str(e)}


@router.get("/health/llm")
async def health_llm():
    """Check OpenAI API key validity with a minimal test call."""
    try:
        oai = get_async_openai()
        await oai.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=1,
        )
        return {"status": "ok", "model": settings.openai_model, "provider": "openai"}
    except Exception as e:
        return {"status": "error", "model": settings.openai_model, "detail": str(e)}
