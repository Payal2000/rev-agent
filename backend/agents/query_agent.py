"""Query Agent — natural language to SQL with 3-step pipeline."""
import logging
from typing import Optional

from graph.state import RevAgentState
from llm import get_llm
from tools.sql_tools import execute_safe_sql, format_results_for_llm, SQLSafetyError
from tools.vector_tools import search_schema

logger = logging.getLogger(__name__)

llm = get_llm(temperature=0)

SQL_GENERATION_TOOL = {
    "type": "function",
    "function": {
        "name": "generate_sql",
        "description": "Generate a PostgreSQL query to answer the user's question.",
        "parameters": {
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "The SQL query. Must be SELECT only. Must include WHERE company_id = '<tenant_id>' for tenant isolation."
                },
                "explanation": {
                    "type": "string",
                    "description": "Plain English explanation of what this SQL does."
                },
                "confidence": {
                    "type": "number",
                    "description": "Confidence 0.0-1.0 that this SQL correctly answers the question."
                },
                "disambiguation_needed": {
                    "type": "boolean",
                    "description": "True if the question is ambiguous and a clarifying question is needed."
                },
                "follow_up_question": {
                    "type": "string",
                    "description": "If disambiguation_needed=true, the clarifying question to ask the user."
                }
            },
            "required": ["sql", "explanation", "confidence", "disambiguation_needed"]
        }
    }
}

SQL_SYSTEM_PROMPT = """You are a SQL generation expert for a SaaS revenue database.
Generate precise, read-only PostgreSQL queries to answer user questions.

Critical rules:
1. ONLY generate SELECT statements — never INSERT, UPDATE, DELETE, DROP, etc.
2. ALWAYS include WHERE company_id = '{tenant_id}' for tenant isolation
3. Use metrics_daily for time-series questions (much faster than aggregating subscriptions)
4. Use subscriptions for current-state questions (active subscribers, current MRR)
5. Use subscription_events for change/movement analysis (net MRR, expansion, contraction)
6. Always use DATE_TRUNC for time grouping
7. Use COALESCE to handle nulls in aggregations
8. Limit results to reasonable sizes (add LIMIT when appropriate)
9. NEVER set disambiguation_needed=true. Always generate your best SQL query based on available context.
   If the question is vague, make a reasonable assumption and generate SQL for the most likely intent.
10. For follow-up questions like "tell me more", "show details", or references to previous context,
    use the conversation history provided to determine what data to retrieve.

The tenant_id placeholder is already filled in — use it exactly as shown.
"""


async def query_agent(state: RevAgentState) -> RevAgentState:
    """Three-step pipeline: schema retrieval → SQL generation → safe execution."""
    user_question = _get_latest_user_question(state)
    tenant_id = state["tenant_id"]
    current_step = state.get("current_step", 0)

    # Step 1: Retrieve relevant schema from pgvector
    logger.info(f"[QueryAgent] Retrieving schema for: {user_question[:80]}...")
    relevant_schema = await search_schema(user_question, top_k=5)
    schema_context = _format_schema_context(relevant_schema)

    # Step 2: Generate SQL with retry loop (up to 3 attempts)
    sql_output = None
    last_error: Optional[str] = None

    # Build conversation history for context (last 3 turns, excluding latest message)
    history_msgs = []
    prior_messages = state["messages"][:-1][-6:]  # up to 3 turns before current
    for msg in prior_messages:
        cls = msg.__class__.__name__
        if "HumanMessage" in cls and getattr(msg, "content", ""):
            history_msgs.append({"role": "user", "content": msg.content})
        elif "AIMessage" in cls and getattr(msg, "content", ""):
            history_msgs.append({"role": "assistant", "content": msg.content[:400]})

    for attempt in range(3):
        error_context = f"\n\nPrevious SQL failed with error: {last_error}\nPlease fix the SQL." if last_error else ""

        system_prompt = SQL_SYSTEM_PROMPT.replace("{tenant_id}", tenant_id)

        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history_msgs)
        messages.append({"role": "user", "content": (
            f"Database schema context:\n{schema_context}\n\n"
            f"Current question: {user_question}"
            f"{error_context}"
        )})

        response = await llm.ainvoke(
            messages,
            tools=[SQL_GENERATION_TOOL],
            tool_choice={"type": "function", "function": {"name": "generate_sql"}},
        )

        tool_call = response.tool_calls[0] if response.tool_calls else None
        if not tool_call:
            last_error = "No SQL generated"
            continue

        sql_output = tool_call["args"]

        # If LLM still marks disambiguation needed despite instructions, treat as error
        # so _synthesize_response can return a helpful clarifying message
        if sql_output.get("disambiguation_needed"):
            follow_up = sql_output.get("follow_up_question", "Could you clarify your question?")
            return {
                **state,
                "current_step": current_step + 1,
                "error": f"CLARIFICATION_NEEDED: {follow_up}",
            }

        # Step 3: Safety check + execute
        try:
            result = await execute_safe_sql(sql_output["sql"], tenant_id)
            formatted = format_results_for_llm(result)

            logger.info(f"[QueryAgent] SQL executed successfully, {result['row_count']} rows (attempt {attempt+1})")

            return {
                **state,
                "query_results": {
                    "sql": sql_output["sql"],
                    "explanation": sql_output.get("explanation", ""),
                    "columns": result["columns"],
                    "rows": result["rows"],
                    "row_count": result["row_count"],
                    "formatted": formatted,
                },
                "current_step": current_step + 1,
                "error": None,
                "retry_count": attempt,
            }

        except SQLSafetyError as e:
            last_error = str(e)
            logger.warning(f"[QueryAgent] Safety check failed (attempt {attempt+1}): {e}")
        except Exception as e:
            last_error = str(e)
            logger.warning(f"[QueryAgent] Execution failed (attempt {attempt+1}): {e}")

    # All retries exhausted
    error_msg = f"Could not generate valid SQL after 3 attempts. Last error: {last_error}"
    logger.error(f"[QueryAgent] {error_msg}")
    return {
        **state,
        "current_step": current_step + 1,
        "error": error_msg,
        "retry_count": 3,
    }


def _get_latest_user_question(state: RevAgentState) -> str:
    """Extract the most recent user message."""
    for msg in reversed(state["messages"]):
        if hasattr(msg, "type") and msg.type == "human":
            return msg.content
        if isinstance(msg, dict) and msg.get("role") == "user":
            return msg.get("content", "")
    return ""


def _format_schema_context(schema_docs: list[dict]) -> str:
    """Format retrieved schema docs for the LLM prompt."""
    lines = []
    for doc in schema_docs:
        lines.append(f"--- {doc['table_name']} (similarity: {doc['similarity']:.2f}) ---")
        lines.append(doc["description"])
        lines.append("")
    return "\n".join(lines)
