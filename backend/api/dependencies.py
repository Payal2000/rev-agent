"""FastAPI dependencies: DB session, tenant context, JWT auth."""
import logging
from typing import Annotated, AsyncGenerator, Optional

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from data.database import AsyncSessionLocal, set_tenant_context

logger = logging.getLogger(__name__)


# ── Tenant model ──────────────────────────────────────────────────────────────

class Tenant:
    def __init__(self, id: str, company_name: str = ""):
        self.id = id
        self.company_name = company_name


# ── JWT auth ──────────────────────────────────────────────────────────────────

ALGORITHM = "HS256"


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_tenant(
    authorization: Annotated[Optional[str], Header()] = None,
    x_tenant_id: Annotated[Optional[str], Header(alias="x-tenant-id")] = None,
) -> Tenant:
    """
    Extract tenant from JWT or x-tenant-id header.
    In development mode with no auth header, use demo tenant.
    """
    if settings.environment == "development" and not authorization and not x_tenant_id:
        # Demo mode — use seed company
        return Tenant(
            id="00000000-0000-0000-0000-000000000001",
            company_name="Demo Company"
        )

    if x_tenant_id:
        return Tenant(id=x_tenant_id)

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required",
        )

    token = authorization.replace("Bearer ", "")
    payload = _decode_token(token)

    tenant_id = payload.get("tenant_id") or payload.get("sub")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="tenant_id not found in token",
        )

    return Tenant(id=tenant_id, company_name=payload.get("company_name", ""))


# ── DB session with tenant RLS ────────────────────────────────────────────────

async def get_db_with_tenant(
    tenant: Annotated[Tenant, Depends(get_tenant)]
) -> AsyncGenerator[AsyncSession, None]:
    """Yield a DB session with RLS tenant context already set."""
    async with AsyncSessionLocal() as session:
        try:
            await set_tenant_context(session, tenant.id)
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


TenantDep = Annotated[Tenant, Depends(get_tenant)]
DBDep = Annotated[AsyncSession, Depends(get_db_with_tenant)]
