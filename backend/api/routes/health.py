"""Health check endpoints."""
from fastapi import APIRouter
from sqlalchemy import text

from data.database import engine

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
