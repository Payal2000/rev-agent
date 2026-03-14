"""Async SQLAlchemy engine, session factory, and DB initialization."""
import sys
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text

from config import settings
from data.models import Base


# ── Engines ───────────────────────────────────────────────────────────────────

engine = create_async_engine(
    settings.database_url,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,       # auto-reconnect on stale connections
    pool_recycle=3600,        # recycle connections every hour
    echo=settings.environment == "development",
)

# Read-only engine for Query Agent — even if SQL safety check passes,
# this DB user physically cannot write.
readonly_engine = create_async_engine(
    settings.db_url_readonly,
    pool_size=10,
    max_overflow=5,
    pool_pre_ping=True,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

ReadonlyAsyncSession = async_sessionmaker(
    readonly_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── Session context manager ───────────────────────────────────────────────────

@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


@asynccontextmanager
async def get_readonly_session() -> AsyncGenerator[AsyncSession, None]:
    async with ReadonlyAsyncSession() as session:
        yield session


# ── FastAPI dependency ────────────────────────────────────────────────────────

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ── DB initialization ─────────────────────────────────────────────────────────

async def init_db():
    """Create all tables and enable pgvector extension."""
    async with engine.begin() as conn:
        # Enable pgvector
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        # Create all ORM tables
        await conn.run_sync(Base.metadata.create_all)
        # Lightweight forward-only schema updates for local/dev environments.
        await _run_lightweight_migrations(conn)
        # Enable Row Level Security on tenant tables
        await _enable_rls(conn)

    print("✓ Database initialized — tables created, pgvector enabled, RLS configured")


async def _enable_rls(conn):
    """Enable Row Level Security on all multi-tenant tables."""
    tenant_tables = [
        "customers", "subscriptions", "invoices",
        "subscription_events", "metrics_daily", "anomaly_alerts",
        "agent_memory",
    ]
    for table in tenant_tables:
        await conn.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
        await conn.execute(text(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY"))
        # Allow superuser to bypass (for migrations/admin)
        # App queries must SET app.current_tenant before executing
        await conn.execute(text(f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_policies
                    WHERE tablename = '{table}' AND policyname = 'tenant_isolation'
                ) THEN
                    CREATE POLICY tenant_isolation ON {table}
                        USING (
                            company_id::text = current_setting('app.current_tenant', true)
                        );
                END IF;
            END $$;
        """))


async def _run_lightweight_migrations(conn):
    """Apply safe schema adjustments that are backward compatible."""
    # Allow invoice storage for one-off/manual invoices that have no subscription.
    await conn.execute(text("ALTER TABLE invoices ALTER COLUMN subscription_id DROP NOT NULL"))
    # Keep Stripe customer id on invoices for fallback joins and analytics.
    await conn.execute(text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_invoices_stripe_customer ON invoices (stripe_customer_id)"))


async def set_tenant_context(session: AsyncSession, tenant_id: str):
    """Set the RLS tenant context for this session."""
    await session.execute(
        text("SELECT set_config('app.current_tenant', :tenant_id, true)"),
        {"tenant_id": tenant_id}
    )


if __name__ == "__main__":
    import asyncio
    asyncio.run(init_db())
