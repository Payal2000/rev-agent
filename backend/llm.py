"""Shared LLM client factory — single source of truth for all agents."""
from functools import lru_cache

from langchain_openai import ChatOpenAI
from openai import AsyncOpenAI

from config import settings


@lru_cache(maxsize=10)
def get_llm(temperature: float = 0) -> ChatOpenAI:
    """Return a cached ChatOpenAI instance for the given temperature."""
    return ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        temperature=temperature,
    )


@lru_cache(maxsize=1)
def get_async_openai() -> AsyncOpenAI:
    """Return a cached AsyncOpenAI client (shared across all requests)."""
    return AsyncOpenAI(api_key=settings.openai_api_key)
