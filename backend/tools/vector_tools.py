"""pgvector similarity search for schema retrieval and RAG playbook."""
import logging
from typing import Any

from openai import AsyncOpenAI
from sqlalchemy import text

from config import settings
from data.database import get_session

logger = logging.getLogger(__name__)
openai_client = AsyncOpenAI(api_key=settings.openai_api_key)


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
    Returns list of {table_name, description, metadata} dicts.
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

    return [
        {
            "table_name": row.table_name,
            "description": row.description,
            "metadata": row.metadata or {},
            "similarity": float(row.similarity),
        }
        for row in rows
    ]


async def search_playbook(query: str, top_k: int = 5) -> list[dict[str, Any]]:
    """
    Retrieve the most relevant playbook entries for a given anomaly/situation.
    Returns list of {title, content, category, estimated_impact, tags} dicts.
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

    return [
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


async def search_agent_memory(query: str, company_id: str, top_k: int = 3) -> list[dict[str, Any]]:
    """
    Retrieve relevant past agent memories for a company.
    Used by agents to recall past recommendations and their outcomes.
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
                ORDER BY content_embedding <=> CAST(:embedding AS vector)
                LIMIT :top_k
            """),
            {"embedding": embedding_str, "company_id": company_id, "top_k": top_k}
        )
        rows = result.fetchall()

    return [
        {
            "memory_type": row.memory_type,
            "content_text": row.content_text,
            "outcome": row.outcome,
            "metadata": row.metadata or {},
            "similarity": float(row.similarity),
        }
        for row in rows
    ]
