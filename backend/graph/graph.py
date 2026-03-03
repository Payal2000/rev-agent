"""LangGraph StateGraph — wires all 6 agents with conditional routing."""
import logging
from typing import Literal

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from graph.state import RevAgentState
from agents.supervisor import supervisor_agent
from agents.query_agent import query_agent
from agents.insights_agent import insights_agent
from agents.forecast_agent import forecast_agent
from agents.action_agent import action_agent
from agents.validator_agent import validator_agent
from config import settings

logger = logging.getLogger(__name__)


# ── Routing functions ─────────────────────────────────────────────────────────

def route_from_supervisor(state: RevAgentState) -> str:
    """After supervisor classifies intent, route to first agent in plan."""
    plan = state.get("routing_plan", [])
    if not plan:
        return "validator"
    return plan[0]


def route_next_agent(state: RevAgentState) -> str:
    """After each agent completes, advance to the next in the routing plan."""
    plan = state.get("routing_plan", [])
    current_step = state.get("current_step", 0)
    next_step = current_step + 1

    if state.get("error") and state.get("retry_count", 0) >= 3:
        return "validator"  # fail gracefully

    if next_step < len(plan):
        return plan[next_step]
    return "validator"


def route_after_action(state: RevAgentState) -> str:
    """After Action Agent: if awaiting human approval, pause; else validate."""
    if state.get("awaiting_approval"):
        return END  # graph pauses — resumes when human approves via /approve endpoint
    return "validator"


def route_after_validator(state: RevAgentState) -> Literal["supervisor", "__end__"]:
    """After Validator: return to supervisor for response aggregation, then END."""
    return END


# ── Build the graph ───────────────────────────────────────────────────────────

def build_graph(checkpointer: AsyncPostgresSaver) -> StateGraph:
    graph = StateGraph(RevAgentState)

    # Add all agent nodes
    graph.add_node("supervisor", supervisor_agent)
    graph.add_node("query", query_agent)
    graph.add_node("insights", insights_agent)
    graph.add_node("forecast", forecast_agent)
    graph.add_node("action", action_agent)
    graph.add_node("validator", validator_agent)

    # Entry point
    graph.set_entry_point("supervisor")

    # Supervisor routes to first agent based on intent
    graph.add_conditional_edges(
        "supervisor",
        route_from_supervisor,
        {
            "query": "query",
            "insights": "insights",
            "forecast": "forecast",
            "action": "action",
            "validator": "validator",
        }
    )

    # Each agent advances to the next in the routing plan
    for agent in ["query", "insights", "forecast"]:
        graph.add_conditional_edges(
            agent,
            route_next_agent,
            {
                "query": "query",
                "insights": "insights",
                "forecast": "forecast",
                "action": "action",
                "validator": "validator",
            }
        )

    # Action agent may pause for human approval
    graph.add_conditional_edges(
        "action",
        route_after_action,
        {
            "validator": "validator",
            END: END,
        }
    )

    # Validator always ends (supervisor has already aggregated)
    graph.add_edge("validator", END)

    return graph.compile(checkpointer=checkpointer)


# ── Singleton graph instance ──────────────────────────────────────────────────

_graph = None


async def get_graph():
    global _graph
    if _graph is None:
        checkpointer = await AsyncPostgresSaver.from_conn_string(
            # AsyncPostgresSaver needs sync-style connection string
            settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
        )
        await checkpointer.setup()
        _graph = build_graph(checkpointer)
        logger.info("✓ LangGraph compiled with PostgreSQL checkpointer")
    return _graph
