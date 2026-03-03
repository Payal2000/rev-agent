"""Supervisor Agent — intent classification and routing."""
import json
import logging
from typing import Any

from langchain_openai import ChatOpenAI
from langchain_core.messages import AIMessage, SystemMessage

from config import settings
from graph.state import RevAgentState

logger = logging.getLogger(__name__)

llm = ChatOpenAI(
    model=settings.openai_model,
    api_key=settings.openai_api_key,
    temperature=0,
)

# ── Intent classification function schema ─────────────────────────────────────

CLASSIFY_INTENT_TOOL = {
    "type": "function",
    "function": {
        "name": "classify_intent",
        "description": "Classify the user's query intent and determine which agents to activate.",
        "parameters": {
            "type": "object",
            "properties": {
                "intent": {
                    "type": "string",
                    "enum": ["data_query", "anomaly_check", "forecast", "action_recommendation", "multi_step"],
                    "description": (
                        "data_query: simple metric lookup (MRR, churn count, subscriber count). "
                        "anomaly_check: asking about anomalies or what went wrong. "
                        "forecast: asking about future projections. "
                        "action_recommendation: asking what to do about a problem. "
                        "multi_step: complex question requiring multiple agents."
                    )
                },
                "routing_plan": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["query", "insights", "forecast", "action"]},
                    "description": "Ordered list of agents to invoke. E.g. ['query'] for simple lookup, ['query', 'insights', 'action'] for churn investigation."
                },
                "reasoning": {
                    "type": "string",
                    "description": "Brief explanation of why this routing plan was chosen."
                }
            },
            "required": ["intent", "routing_plan", "reasoning"]
        }
    }
}

SUPERVISOR_SYSTEM_PROMPT = """You are the Supervisor Agent for RevAgent, a SaaS revenue intelligence platform.

Your job is to classify the user's question and determine which specialist agents to activate.

Available agents:
- query: Translates natural language to SQL and retrieves data from the database
- insights: Detects anomalies and explains unusual metric movements
- forecast: Projects future MRR, churn, and revenue trends
- action: Generates ranked recommendations with business impact estimates

Routing rules:
- Simple metric questions ("What is our MRR?") → ["query"]
- Anomaly questions ("Why did churn spike?") → ["query", "insights"]
- Forecast questions ("What will MRR be next quarter?") → ["query", "forecast"]
- Action questions ("What should we do about churn?") → ["query", "insights", "action"]
- Complex questions ("Why did churn spike and what should we do?") → ["query", "insights", "forecast", "action"]

Always include "query" first when data retrieval is needed."""


async def supervisor_agent(state: RevAgentState) -> RevAgentState:
    """Classify intent and build routing plan."""
    user_message = state["messages"][-1].content if state["messages"] else ""

    # Check if this is a resumption after human approval
    if state.get("awaiting_approval") is False and state.get("recommendations"):
        # Human just approved — supervisor aggregates final response
        return await _aggregate_final_response(state)

    response = await llm.ainvoke(
        [
            SystemMessage(content=SUPERVISOR_SYSTEM_PROMPT),
            *state["messages"],
        ],
        tools=[CLASSIFY_INTENT_TOOL],
        tool_choice={"type": "function", "function": {"name": "classify_intent"}},
    )

    tool_call = response.tool_calls[0] if response.tool_calls else None
    if not tool_call:
        return {
            **state,
            "intent": "data_query",
            "routing_plan": ["query"],
            "current_step": 0,
            "error": "Supervisor could not classify intent — defaulting to query agent",
        }

    classification = tool_call["args"]
    logger.info(f"[Supervisor] Intent: {classification['intent']}, Plan: {classification['routing_plan']}")

    return {
        **state,
        "intent": classification["intent"],
        "routing_plan": classification["routing_plan"],
        "current_step": 0,
        "awaiting_approval": False,
        "error": None,
    }


async def _aggregate_final_response(state: RevAgentState) -> RevAgentState:
    """Build the final aggregated response from all agent outputs."""
    parts = []

    if state.get("query_results"):
        qr = state["query_results"]
        parts.append(f"**Data Retrieved:** {qr.get('row_count', 0)} rows returned.")

    if state.get("anomalies"):
        for anomaly in state["anomalies"]:
            parts.append(f"\n**Anomaly:** {anomaly['explanation']}")

    if state.get("forecast"):
        fc = state["forecast"]
        parts.append(f"\n**Forecast:** {fc.get('narrative', '')}")

    if state.get("recommendations"):
        parts.append("\n**Recommendations:**")
        for rec in state["recommendations"]:
            parts.append(f"{rec['rank']}. **{rec['title']}** — {rec['estimated_impact']}")

    summary = "\n".join(parts) if parts else "Analysis complete."

    return {
        **state,
        "messages": state["messages"] + [AIMessage(content=summary)],
    }
