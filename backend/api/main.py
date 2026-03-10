"""FastAPI application — entry point for RevAgent backend."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from data.database import init_db
from graph.graph import get_graph
from api.routes import chat, chat_history, webhook, approval, health, slack, discord, metrics, insights_data, forecast_data

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: init DB tables + compile LangGraph. Shutdown: cleanup."""
    logger.info("Starting RevAgent backend...")

    # Initialize database tables and pgvector
    await init_db()

    # Pre-compile LangGraph (connects PostgreSQL checkpointer)
    await get_graph()

    logger.info("✓ RevAgent backend ready")
    yield

    logger.info("Shutting down RevAgent backend...")


app = FastAPI(
    title="RevAgent API",
    description="Multi-agent SaaS revenue intelligence platform",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
app.include_router(health.router, tags=["health"])
app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(chat_history.router, prefix="/api", tags=["chat"])
app.include_router(webhook.router, prefix="/api", tags=["webhooks"])
app.include_router(approval.router, prefix="/api", tags=["approvals"])
app.include_router(slack.router, prefix="/api", tags=["slack"])
app.include_router(discord.router, prefix="/api", tags=["discord"])
app.include_router(metrics.router, prefix="/api", tags=["metrics"])
app.include_router(insights_data.router, prefix="/api", tags=["insights"])
app.include_router(forecast_data.router, prefix="/api", tags=["forecast"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)
