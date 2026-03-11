"""Validator Agent — SQL safety, LLM-as-judge quality scoring, and audit logging."""
import hashlib
import logging
from datetime import datetime, timezone

from sqlalchemy.dialects.postgresql import insert as pg_insert

from data.database import get_session
from data.models import AuditLog
from graph.state import RevAgentState
from llm import get_llm
from tools.sql_tools import check_sql_safety

logger = logging.getLogger(__name__)

llm = get_llm(temperature=0)

LLM_JUDGE_TOOL = {
    "type": "function",
    "function": {
        "name": "evaluate_output",
        "description": "Evaluate the quality and safety of agent outputs.",
        "parameters": {
            "type": "object",
            "properties": {
                "score": {
                    "type": "number",
                    "description": "Overall quality score from 1 (poor) to 5 (excellent)"
                },
                "relevance": {
                    "type": "number",
                    "description": "How relevant is the output to the user's question? 1-5"
                },
                "accuracy": {
                    "type": "number",
                    "description": "How accurate and factually correct does the output appear? 1-5"
                },
                "checks_passed": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of validation checks that passed"
                },
                "checks_failed": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of validation checks that failed"
                },
                "decision": {
                    "type": "string",
                    "enum": ["approve", "reject"],
                    "description": "Final decision: approve if score >= 3.0, reject otherwise"
                },
                "reason": {
                    "type": "string",
                    "description": "Explanation for the decision"
                }
            },
            "required": ["score", "relevance", "accuracy", "checks_passed", "checks_failed", "decision", "reason"]
        }
    }
}


async def validator_agent(state: RevAgentState) -> RevAgentState:
    """Review all agent outputs, score them, and log to audit trail."""
    tenant_id = state["tenant_id"]
    current_step = state.get("current_step", 0)

    checks_passed = []
    checks_failed = []

    # ── Check 1: SQL safety ───────────────────────────────────────────────────
    query_results = state.get("query_results")
    if query_results and query_results.get("sql"):
        sql = query_results["sql"]
        is_safe, reason = check_sql_safety(sql, tenant_id)
        if is_safe:
            checks_passed.append("sql_safety")
        else:
            checks_failed.append(f"sql_safety: {reason}")
            logger.warning(f"[Validator] SQL safety check failed: {reason}")

    # ── Check 2: Tenant isolation ─────────────────────────────────────────────
    if query_results and query_results.get("sql"):
        if "company_id" in query_results["sql"].lower():
            checks_passed.append("tenant_isolation")
        else:
            checks_failed.append("tenant_isolation: company_id filter missing")

    # ── Check 3: Anomaly data sanity ──────────────────────────────────────────
    anomalies = state.get("anomalies", [])
    if anomalies:
        if all(isinstance(a.get("z_score"), (int, float)) for a in anomalies):
            checks_passed.append("anomaly_data_integrity")
        else:
            checks_failed.append("anomaly_data_integrity: invalid z_score values")

    # ── Check 4: Recommendations policy ──────────────────────────────────────
    recommendations = state.get("recommendations", [])
    if recommendations:
        valid_categories = {"churn_reduction", "expansion", "pricing", "operations"}
        if all(r.get("category") in valid_categories for r in recommendations):
            checks_passed.append("recommendation_policy")
        else:
            checks_failed.append("recommendation_policy: unknown recommendation category")

    # ── Check 5: LLM-as-judge overall quality ─────────────────────────────────
    llm_evaluation = await _llm_judge(state, checks_passed, checks_failed)

    validation_score = llm_evaluation.get("score", 0)
    decision = llm_evaluation.get("decision", "reject")
    all_passed = llm_evaluation.get("checks_passed", []) + checks_passed
    all_failed = llm_evaluation.get("checks_failed", []) + checks_failed

    # ── Log to audit trail ────────────────────────────────────────────────────
    await _log_audit(
        state=state,
        validation_score=validation_score,
        checks_passed=all_passed,
        checks_failed=all_failed,
        decision=decision,
        reason=llm_evaluation.get("reason", ""),
    )

    logger.info(
        f"[Validator] Score: {validation_score:.1f}/5, "
        f"Decision: {decision}, "
        f"Passed: {len(all_passed)}, Failed: {len(all_failed)}"
    )

    return {
        **state,
        "validation_passed": decision == "approve",
        "validation_score": validation_score,
        "validation_notes": llm_evaluation.get("reason", ""),
        "current_step": current_step + 1,
    }


async def _llm_judge(state: RevAgentState, checks_passed: list, checks_failed: list) -> dict:
    """Use LLM to evaluate overall output quality."""
    user_question = ""
    for msg in reversed(state["messages"]):
        if hasattr(msg, "type") and msg.type == "human":
            user_question = msg.content
            break

    # Build output summary for evaluation
    output_parts = []
    if state.get("query_results"):
        output_parts.append(f"Query results: {state['query_results'].get('formatted', '')[:300]}")
    if state.get("anomalies"):
        output_parts.append(f"Anomalies found: {len(state['anomalies'])}")
    if state.get("forecast"):
        output_parts.append(f"Forecast trend: {state['forecast'].get('trend')}")
    if state.get("recommendations"):
        output_parts.append(f"Recommendations: {len(state['recommendations'])}")

    if not output_parts:
        return {
            "score": 3.0,
            "relevance": 3,
            "accuracy": 3,
            "checks_passed": checks_passed,
            "checks_failed": checks_failed,
            "decision": "approve",
            "reason": "No substantial output to evaluate"
        }

    response = await llm.ainvoke(
        [
            {
                "role": "system",
                "content": (
                    "You are a quality assurance auditor for an AI revenue analytics system. "
                    "Evaluate whether the agent's output appropriately answers the user's question. "
                    "Be strict about data accuracy and relevance. "
                    "Approve if score >= 3.0 and no critical safety checks failed."
                )
            },
            {
                "role": "user",
                "content": (
                    f"User question: {user_question}\n\n"
                    f"Agent output summary:\n" + "\n".join(output_parts) + "\n\n"
                    f"Safety checks passed: {', '.join(checks_passed) or 'none'}\n"
                    f"Safety checks failed: {', '.join(checks_failed) or 'none'}"
                )
            }
        ],
        tools=[LLM_JUDGE_TOOL],
        tool_choice={"type": "function", "function": {"name": "evaluate_output"}},
    )

    tool_call = response.tool_calls[0] if response.tool_calls else None
    if not tool_call:
        return {
            "score": 2.0,
            "decision": "reject",
            "reason": "LLM judge failed to evaluate",
            "checks_passed": [],
            "checks_failed": ["llm_judge_failure"]
        }

    result = tool_call["args"]

    # Override decision if critical safety checks failed
    if checks_failed:
        result["decision"] = "reject"
        result["reason"] = f"Failed safety checks: {', '.join(checks_failed)}"

    return result


async def _log_audit(
    state: RevAgentState,
    validation_score: float,
    checks_passed: list,
    checks_failed: list,
    decision: str,
    reason: str,
):
    """Write audit log entry to the database."""
    # Hash the input and output for audit trail
    input_text = str(state.get("messages", ""))
    output_text = str({
        "query_results": state.get("query_results"),
        "anomalies": state.get("anomalies"),
        "recommendations": state.get("recommendations"),
    })

    input_hash = hashlib.sha256(input_text.encode()).hexdigest()[:32]
    output_hash = hashlib.sha256(output_text.encode()).hexdigest()[:32]

    try:
        async with get_session() as session:
            await session.execute(
                pg_insert(AuditLog).values(
                    company_id=state.get("tenant_id"),
                    agent_id="validator",
                    trace_id=state.get("audit_trace_id"),
                    input_hash=input_hash,
                    output_hash=output_hash,
                    validation_score=validation_score,
                    checks_passed=checks_passed,
                    checks_failed=checks_failed,
                    decision=decision,
                    reason=reason,
                )
            )
    except Exception as e:
        logger.error(f"[Validator] Failed to write audit log: {e}")
