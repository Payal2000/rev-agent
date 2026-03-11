"""Action Agent — RAG playbook recommendations with human-in-the-loop interrupt."""
import logging
from typing import Optional

from langchain_core.messages import AIMessage
from langgraph.types import interrupt

from graph.state import RevAgentState, Recommendation
from llm import get_llm
from tools.vector_tools import search_playbook, search_agent_memory

logger = logging.getLogger(__name__)

llm = get_llm(temperature=0.3)

RANKING_TOOL = {
    "type": "function",
    "function": {
        "name": "rank_recommendations",
        "description": "Generate ranked action recommendations based on anomalies and playbook.",
        "parameters": {
            "type": "object",
            "properties": {
                "recommendations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "rank": {"type": "integer"},
                            "title": {"type": "string"},
                            "description": {"type": "string"},
                            "estimated_impact": {"type": "string"},
                            "category": {
                                "type": "string",
                                "enum": ["churn_reduction", "expansion", "pricing", "operations"]
                            },
                            "requires_approval": {"type": "boolean"},
                            "urgency": {"type": "string", "enum": ["immediate", "this_week", "this_month"]}
                        },
                        "required": ["rank", "title", "description", "estimated_impact", "category", "requires_approval"]
                    }
                },
                "total_estimated_impact": {
                    "type": "string",
                    "description": "Total combined estimated revenue impact of all recommendations"
                }
            },
            "required": ["recommendations", "total_estimated_impact"]
        }
    }
}


async def action_agent(state: RevAgentState) -> RevAgentState:
    """Retrieve playbook recommendations, rank them, then require human approval."""
    tenant_id = state["tenant_id"]
    current_step = state.get("current_step", 0)

    anomalies = state.get("anomalies", [])
    forecast = state.get("forecast")

    if not anomalies and not forecast:
        return {
            **state,
            "recommendations": [],
            "current_step": current_step + 1,
        }

    logger.info(f"[ActionAgent] Generating recommendations based on {len(anomalies)} anomalies")

    # Build search query from anomaly context
    search_query = _build_search_query(anomalies, forecast)

    # Retrieve relevant playbook strategies
    playbook_entries = await search_playbook(search_query, top_k=5)

    # Retrieve relevant past memories (what worked before)
    past_memories = await search_agent_memory(search_query, tenant_id, top_k=3)

    # Generate ranked recommendations via LLM
    recommendations = await _generate_recommendations(
        anomalies=anomalies,
        forecast=forecast,
        playbook_entries=playbook_entries,
        past_memories=past_memories,
        tenant_id=tenant_id,
    )

    if not recommendations:
        return {
            **state,
            "recommendations": [],
            "current_step": current_step + 1,
        }

    # ── Human-in-the-loop interrupt ───────────────────────────────────────────
    # Pause graph execution and wait for human approval before proceeding.
    # The graph state is persisted to PostgreSQL via the checkpointer.
    # The frontend displays this context and the human approves/rejects.

    approval_context = {
        "recommendations": recommendations,
        "anomaly_summary": [
            {"metric": a["metric_name"], "severity": a["severity"], "z_score": a["z_score"]}
            for a in anomalies[:3]
        ],
        "forecast_summary": {
            "projection_30d": forecast.get("projection_30d") if forecast else None,
            "trend": forecast.get("trend") if forecast else None,
        } if forecast else None,
    }

    # This pauses execution — graph resumes when human sends POST /approve/{session_id}
    approval_decision = interrupt(approval_context)

    # ── Resumed after human decision ──────────────────────────────────────────
    approved = approval_decision.get("approved", False)
    modified_action = approval_decision.get("modified_action")

    if not approved:
        logger.info("[ActionAgent] Human rejected recommendations")
        return {
            **state,
            "recommendations": [],
            "awaiting_approval": False,
            "current_step": current_step + 1,
            "messages": state["messages"] + [
                AIMessage(content="Recommendations were reviewed and not approved for execution.")
            ],
        }

    if modified_action:
        logger.info(f"[ActionAgent] Human modified recommendation: {modified_action}")
        # Apply human modification to first recommendation
        recommendations[0]["description"] = modified_action

    new_messages = state["messages"] + [
        AIMessage(content=_format_recommendations(recommendations))
    ]

    return {
        **state,
        "recommendations": recommendations,
        "awaiting_approval": False,
        "messages": new_messages,
        "current_step": current_step + 1,
    }


def _build_search_query(anomalies: list, forecast) -> str:
    """Build a search query from anomaly context."""
    parts = []
    for anomaly in anomalies[:3]:
        metric = anomaly["metric_name"].replace("_", " ")
        direction = "increase" if anomaly["z_score"] > 0 else "decrease"
        parts.append(f"{metric} {direction}")

    if forecast and forecast.get("trend") == "declining":
        parts.append("revenue decline")

    return " ".join(parts) if parts else "churn reduction"


async def _generate_recommendations(
    anomalies: list,
    forecast: Optional[dict],
    playbook_entries: list[dict],
    past_memories: list[dict],
    tenant_id: str,
) -> list[Recommendation]:
    """LLM generates ranked recommendations from playbook entries and context."""

    # Format playbook context — include similarity score so the LLM can weight
    # poor-fit strategies appropriately rather than treating all entries equally.
    # Entries below 0.65 similarity are flagged as weak matches.
    if playbook_entries:
        playbook_context = "\n\n".join([
            (
                f"Strategy: {e['title']} (relevance: {e['similarity']:.2f}"
                + (" — WEAK MATCH, use with caution" if e['similarity'] < 0.65 else "")
                + f")\n{e['content']}\nEstimated impact: {e['estimated_impact']}"
            )
            for e in playbook_entries[:4]
        ])
    else:
        playbook_context = (
            "No closely matching playbook strategies found for this situation. "
            "Generate recommendations based on general SaaS best practices and the anomaly data alone. "
            "Do NOT invent specific strategies — be conservative and flag that these are first-principles recommendations."
        )

    # Format anomaly context
    anomaly_context = "\n".join([
        f"- {a['metric_name']}: z={a['z_score']:.1f}, severity={a['severity']}, {a['explanation'][:200]}"
        for a in anomalies[:3]
    ])

    # Format past memory context
    memory_context = ""
    if past_memories:
        memory_context = "\n\nPast successful actions:\n" + "\n".join([
            f"- {m['content_text'][:150]} (outcome: {m.get('outcome', 'unknown')})"
            for m in past_memories
        ])

    forecast_context = ""
    if forecast:
        forecast_context = (
            f"\nForecast: MRR projected to {forecast.get('trend', 'stable')} "
            f"30-day projection: ${forecast.get('projection_30d', 0):,.0f}"
        )

    response = await llm.ainvoke(
        [
            {
                "role": "system",
                "content": (
                    "You are a SaaS revenue strategy advisor. "
                    "Based on detected anomalies and available playbook strategies, "
                    "generate 3 ranked, specific action recommendations. "
                    "Prioritize by estimated revenue impact. "
                    "Be specific about the action, timeline, and expected outcome.\n\n"
                    "Retrieval quality rules:\n"
                    "- Each strategy is labeled with a relevance score (0.0–1.0). "
                    "Scores >= 0.65 are strong matches; use them confidently.\n"
                    "- Scores < 0.65 are labeled WEAK MATCH. You may reference them but "
                    "must qualify the recommendation (e.g. 'this may not directly apply').\n"
                    "- If no strategies are provided, generate conservative first-principles "
                    "advice and explicitly state that no playbook match was found.\n"
                    "- Never present a weak-match strategy as a confident best practice."
                )
            },
            {
                "role": "user",
                "content": (
                    f"Anomalies detected:\n{anomaly_context}"
                    f"{forecast_context}"
                    f"{memory_context}\n\n"
                    f"Available strategies:\n{playbook_context}"
                )
            }
        ],
        tools=[RANKING_TOOL],
        tool_choice={"type": "function", "function": {"name": "rank_recommendations"}},
    )

    tool_call = response.tool_calls[0] if response.tool_calls else None
    if not tool_call:
        return []

    raw_recs = tool_call["args"].get("recommendations", [])
    return [
        Recommendation(
            rank=r.get("rank", i + 1),
            title=r.get("title", ""),
            description=r.get("description", ""),
            estimated_impact=r.get("estimated_impact", "Unknown"),
            category=r.get("category", "operations"),
            requires_approval=r.get("requires_approval", True),
        )
        for i, r in enumerate(raw_recs)
    ]


def _format_recommendations(recommendations: list[Recommendation]) -> str:
    lines = ["**Approved Action Recommendations:**\n"]
    for rec in recommendations:
        lines.append(
            f"{rec['rank']}. **{rec['title']}**\n"
            f"   {rec['description']}\n"
            f"   _Estimated impact: {rec['estimated_impact']}_\n"
        )
    return "\n".join(lines)
