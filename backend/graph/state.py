"""Shared LangGraph state for the RevAgent multi-agent system."""
from typing import Annotated, Any, Optional
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class Anomaly(TypedDict):
    metric_name: str
    current_value: float
    baseline_value: float
    z_score: float
    severity: str           # low / medium / high / critical
    explanation: str
    period: str             # e.g. "last 30 days"


class Recommendation(TypedDict):
    rank: int
    title: str
    description: str
    estimated_impact: str
    category: str           # churn_reduction / expansion / pricing
    requires_approval: bool


class ForecastResult(TypedDict):
    metric: str
    projection_30d: float
    projection_60d: float
    projection_90d: float
    confidence_interval_80: dict   # {low: float, high: float}
    confidence_interval_95: dict
    trend: str                     # improving / declining / stable
    narrative: str


class RevAgentState(TypedDict):
    # Conversation
    messages: Annotated[list, add_messages]

    # Identity
    tenant_id: str
    session_id: str

    # Supervisor routing
    intent: str                        # data_query / anomaly_check / forecast / action_recommendation / multi_step
    routing_plan: list[str]            # ordered list of agents to invoke
    current_step: int                  # index into routing_plan

    # Agent outputs (accumulated as agents run)
    query_results: Optional[dict]      # {sql, columns, rows, row_count}
    anomalies: Optional[list[Anomaly]]
    forecast: Optional[ForecastResult]
    recommendations: Optional[list[Recommendation]]

    # Validator
    validation_passed: bool
    validation_score: Optional[float]
    validation_notes: Optional[str]

    # Human-in-the-loop
    awaiting_approval: bool
    approval_context: Optional[dict]   # what the human needs to review

    # Audit
    audit_trace_id: Optional[str]

    # Error handling
    error: Optional[str]
    retry_count: int
