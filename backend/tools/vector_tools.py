"""pgvector similarity search for schema retrieval and RAG playbook."""
import logging
from typing import Any

from openai import AsyncOpenAI
from sqlalchemy import text

from config import settings
from data.database import get_session

logger = logging.getLogger(__name__)
openai_client = AsyncOpenAI(api_key=settings.openai_api_key)

# ── Retrieval quality thresholds ──────────────────────────────────────────────
# Results below these thresholds are dropped rather than passed to the LLM.
# A low-similarity result is worse than no result — the LLM will hallucinate
# SQL or recommendations anchored to context that doesn't match the question.
SCHEMA_SIMILARITY_THRESHOLD = 0.55
PLAYBOOK_SIMILARITY_THRESHOLD = 0.55
MEMORY_SIMILARITY_THRESHOLD = 0.50

# Memories older than this are excluded — stale outcomes distort ranking.
MEMORY_MAX_AGE_DAYS = 180


async def embed_query(query: str) -> list[float]:
    """Embed a user query for similarity search."""
    response = await openai_client.embeddings.create(
        model=settings.openai_embedding_model,
        input=query,
    )
    return response.data[0].embedding


async def search_schema(query: str, top_k: int = 5) -> list[dict[str, Any]]:
    """
    Retrieve the most relevant schema descriptions for a user question.
    Returns list of {table_name, description, metadata, similarity} dicts.

    Returns an empty list if no result meets SCHEMA_SIMILARITY_THRESHOLD.
    Callers must handle the empty case and refuse to generate SQL rather than
    hallucinating against irrelevant schema context.
    """
    embedding = await embed_query(query)
    embedding_str = f"[{','.join(str(x) for x in embedding)}]"

    async with get_session() as session:
        result = await session.execute(
            text("""
                SELECT
                    table_name,
                    description,
                    metadata,
                    1 - (embedding <=> CAST(:embedding AS vector)) AS similarity
                FROM schema_embeddings
                ORDER BY embedding <=> CAST(:embedding AS vector)
                LIMIT :top_k
            """),
            {"embedding": embedding_str, "top_k": top_k}
        )
        rows = result.fetchall()

    docs = [
        {
            "table_name": row.table_name,
            "description": row.description,
            "metadata": row.metadata or {},
            "similarity": float(row.similarity),
        }
        for row in rows
    ]

    # Drop results below threshold — low-similarity context is worse than none
    filtered = [d for d in docs if d["similarity"] >= SCHEMA_SIMILARITY_THRESHOLD]

    if not filtered:
        best = f"{docs[0]['similarity']:.3f}" if docs else "N/A"
        logger.warning(
            f"[VectorTools] schema search returned no results above threshold "
            f"{SCHEMA_SIMILARITY_THRESHOLD} for query: '{query[:80]}' "
            f"(best score: {best})"
        )
    else:
        dropped = len(docs) - len(filtered)
        if dropped:
            logger.debug(
                f"[VectorTools] schema: kept {len(filtered)}/{len(docs)} results "
                f"(dropped {dropped} below {SCHEMA_SIMILARITY_THRESHOLD})"
            )

    return filtered


async def search_playbook(query: str, top_k: int = 5) -> list[dict[str, Any]]:
    """
    Retrieve the most relevant playbook entries for a given anomaly/situation.
    Returns list of {title, content, category, estimated_impact, tags, similarity} dicts.

    Returns an empty list if no result meets PLAYBOOK_SIMILARITY_THRESHOLD.
    Callers should fall back to generic advice rather than forcing poor-fit playbook
    entries through to the LLM recommendation generator.
    """
    embedding = await embed_query(query)
    embedding_str = f"[{','.join(str(x) for x in embedding)}]"

    async with get_session() as session:
        result = await session.execute(
            text("""
                SELECT
                    title,
                    content,
                    category,
                    estimated_impact,
                    tags,
                    1 - (embedding <=> CAST(:embedding AS vector)) AS similarity
                FROM rag_playbook
                ORDER BY embedding <=> CAST(:embedding AS vector)
                LIMIT :top_k
            """),
            {"embedding": embedding_str, "top_k": top_k}
        )
        rows = result.fetchall()

    entries = [
        {
            "title": row.title,
            "content": row.content,
            "category": row.category,
            "estimated_impact": row.estimated_impact,
            "tags": row.tags or [],
            "similarity": float(row.similarity),
        }
        for row in rows
    ]

    filtered = [e for e in entries if e["similarity"] >= PLAYBOOK_SIMILARITY_THRESHOLD]

    if not filtered:
        best = f"{entries[0]['similarity']:.3f}" if entries else "N/A"
        logger.warning(
            f"[VectorTools] playbook search returned no results above threshold "
            f"{PLAYBOOK_SIMILARITY_THRESHOLD} for query: '{query[:80]}' "
            f"(best score: {best})"
        )
    else:
        dropped = len(entries) - len(filtered)
        if dropped:
            logger.debug(
                f"[VectorTools] playbook: kept {len(filtered)}/{len(entries)} results "
                f"(dropped {dropped} below {PLAYBOOK_SIMILARITY_THRESHOLD})"
            )

    return filtered


async def search_agent_memory(query: str, company_id: str, top_k: int = 3) -> list[dict[str, Any]]:
    """
    Retrieve relevant past agent memories for a company.
    Used by agents to recall past recommendations and their outcomes.

    Applies two quality gates:
    - Recency: excludes memories older than MEMORY_MAX_AGE_DAYS (stale outcomes)
    - Similarity: excludes results below MEMORY_SIMILARITY_THRESHOLD
    """
    embedding = await embed_query(query)
    embedding_str = f"[{','.join(str(x) for x in embedding)}]"

    async with get_session() as session:
        result = await session.execute(
            text("""
                SELECT
                    memory_type,
                    content_text,
                    outcome,
                    metadata,
                    created_at,
                    1 - (content_embedding <=> CAST(:embedding AS vector)) AS similarity
                FROM agent_memory
                WHERE company_id = :company_id
                    AND content_embedding IS NOT NULL
                    AND created_at >= NOW() - make_interval(days => :max_age_days)
                ORDER BY content_embedding <=> CAST(:embedding AS vector)
                LIMIT :top_k
            """),
            {
                "embedding": embedding_str,
                "company_id": company_id,
                "max_age_days": MEMORY_MAX_AGE_DAYS,
                "top_k": top_k,
            }
        )
        rows = result.fetchall()

    memories = [
        {
            "memory_type": row.memory_type,
            "content_text": row.content_text,
            "outcome": row.outcome,
            "metadata": row.metadata or {},
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "similarity": float(row.similarity),
        }
        for row in rows
    ]

    filtered = [m for m in memories if m["similarity"] >= MEMORY_SIMILARITY_THRESHOLD]

    if memories and not filtered:
        logger.debug(
            f"[VectorTools] memory: all results below threshold "
            f"{MEMORY_SIMILARITY_THRESHOLD} (best: {memories[0]['similarity']:.3f})"
        )

    return filtered
