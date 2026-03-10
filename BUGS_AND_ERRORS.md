# RevAgent — Bugs & Errors Log

A chronological record of every bug encountered, the solution applied, and the reasoning behind it.

---

## 1. SQLAlchemy Reserved Attribute Name

**File:** `backend/data/models.py`

**Error:**
```
sqlalchemy.exc.InvalidRequestError: Attribute name 'metadata' is reserved when using the Declarative API.
```

**Cause:**
A database model column was named `metadata`, which conflicts with SQLAlchemy's internal `DeclarativeBase.metadata` class attribute used to track table schema information.

**Solution:**
Renamed the Python attribute to `extra` while keeping the underlying DB column name as `"metadata"` using SQLAlchemy's column alias syntax:
```python
# Before
metadata = Column(JSONB)

# After
extra = Column("metadata", JSONB)
```

**Why this solution:**
Renaming the column alias keeps the database schema unchanged (no migration needed) while resolving the Python-level naming conflict cleanly.

---

## 2. sqlglot API Change — TruncateTable

**File:** `backend/tools/sql_tools.py`

**Error:**
```
AttributeError: module 'sqlglot.exp' has no attribute 'Truncate'
```

**Cause:**
The SQL safety checker used `sqlglot.exp.Truncate` to detect TRUNCATE statements in parsed SQL. This attribute was renamed in a newer version of sqlglot.

**Solution:**
```python
# Before
sqlglot.exp.Truncate

# After
sqlglot.exp.TruncateTable
```

**Why this solution:**
Direct API fix to match the updated sqlglot library. No logic change needed — just the correct class name.

---

## 3. AsyncPostgresSaver Context Manager Misuse

**File:** `backend/graph/graph.py`

**Error:**
```
TypeError: object AsyncPostgresSaver is not awaitable
```

**Cause:**
`AsyncPostgresSaver.from_conn_string()` returns an `@asynccontextmanager`, not a coroutine. The code was calling `await` on it directly, which doesn't work.

**Solution:**
```python
# Before (wrong)
checkpointer = await AsyncPostgresSaver.from_conn_string(conn_str)

# After (correct)
_checkpointer_cm = AsyncPostgresSaver.from_conn_string(conn_str)
checkpointer = await _checkpointer_cm.__aenter__()
```
The context manager is stored in a module-level variable to keep it alive (prevent garbage collection).

**Why this solution:**
`asynccontextmanager` objects must be entered via `__aenter__()`. Storing the CM at module level ensures the connection pool stays open for the lifetime of the app.

---

## 4. AI Response Not Persisted in Chat History

**File:** `backend/api/routes/chat.py`

**Error:**
No Python error — silent functional bug. Chat history showed only user messages, never AI responses. Restoring a session showed empty assistant turns.

**Cause:**
The `_synthesize_response()` function generated the final narrative but never wrote it back to the LangGraph checkpoint. The checkpoint only stored what the agents produced internally — not the post-processed synthesis shown to the user.

**Solution:**
After synthesizing the narrative, persist it as an `AIMessage` back into the LangGraph checkpoint:
```python
await graph.aupdate_state(config, {"messages": [AIMessage(content=narrative)]})
```

**Why this solution:**
LangGraph's `add_messages` reducer appends new messages to existing state. Writing back an `AIMessage` ensures it appears in `graph.aget_state()` when restoring session history.

---

## 5. datetime Not JSON Serializable

**File:** `backend/api/routes/chat.py`

**Error:**
```
TypeError: Object of type datetime is not JSON serializable
```

**Cause:**
PostgreSQL query results returned via asyncpg contain Python `datetime` and `date` objects. When `_detect_chart()` tried to serialize these rows into a JSON SSE event, it crashed.

**Solution:**
Added `_serialize_rows()` helper that converts all non-serializable types:
```python
if isinstance(v, (dt, date)):
    s = str(v)[:10]  # "2024-03-01"
    return s[:7] if s.endswith("-01") else s  # "2024-03" for month-start dates
```

**Why this solution:**
Truncating to `YYYY-MM` for month-start dates produces cleaner chart axis labels. The check-then-convert pattern is explicit and predictable for datetime types.

---

## 6. UUID Not JSON Serializable

**File:** `backend/api/routes/chat.py`

**Error:**
```
TypeError: Object of type UUID is not JSON serializable
```

**Cause:**
asyncpg returns UUID columns as Python `uuid.UUID` objects, not strings. The datetime fix in Bug #5 didn't cover UUIDs, causing the same crash on any query returning ID columns.

**Solution:**
Extended `_serialize_rows()` with a catch-all fallback:
```python
try:
    json.dumps(v)
    return v
except (TypeError, ValueError):
    return str(v)
```

**Why this solution:**
Rather than enumerating every possible non-serializable type (UUID, Decimal, enum, custom objects), this approach tests serializability directly and falls back to `str()`. Future-proof against any other asyncpg types without code changes.

---

## 7. Agent Responses Generic / Asking for Clarification Instead of Answering

**Files:** `backend/agents/query_agent.py`, `backend/api/routes/chat.py`

**Error:**
No Python error — functional quality bug. The chat responded with *"What specific information are you looking for regarding subscriptions?"* regardless of what the user asked. Affected queries like "Growth Tier", "Can you tell me more?", and other follow-up questions.

**Root Cause (3 parts):**

**a)** The query agent's `SQL_GENERATION_TOOL` had a `disambiguation_needed` field. The LLM was setting it to `True` for vague or follow-up queries, causing the agent to skip SQL generation and return a clarifying question as an `AIMessage` instead.

**b)** `chat.py` had a post-graph loop that scanned for any `AIMessage` in state and streamed it directly — originally intended for the HITL approval flow. This incorrectly intercepted disambiguation messages and showed them as the final response, bypassing `_synthesize_response` entirely.

**c)** The query agent passed only the current user message to the SQL-generation LLM. For follow-up questions like "Can you tell me more?", the LLM had zero context about the previous turn, making it impossible to infer intent.

**Solutions:**

**a)** Added explicit instruction to the SQL system prompt:
```
9. NEVER set disambiguation_needed=true. Always generate your best SQL query based on available context.
   If the question is vague, make a reasonable assumption and generate SQL for the most likely intent.
```
If the LLM still sets it (edge case), store as `error: "CLARIFICATION_NEEDED: ..."` instead of an `AIMessage` — so `_synthesize_response` can return it cleanly.

**b)** Fixed `chat.py` to only use an existing `AIMessage` from state when `recommendations` also exist (confirming this is a true HITL flow). Otherwise, always call `_synthesize_response`:
```python
if hitl_response and sv.get("recommendations"):
    yield sse_event("token", {"content": hitl_response})
else:
    narrative = await _synthesize_response(sv)
    ...
```

**c)** Pass the last 3 conversation turns (6 messages) as history to the query agent's LLM call:
```python
prior_messages = state["messages"][:-1][-6:]
for msg in prior_messages:
    if "HumanMessage" in cls:
        history_msgs.append({"role": "user", "content": msg.content})
    elif "AIMessage" in cls:
        history_msgs.append({"role": "assistant", "content": msg.content[:400]})
```

**Why this solution:**
The three fixes address each sub-cause independently. Instructing the LLM to never disambiguate is the primary fix. The AIMessage detection fix prevents the bypass. The history fix enables proper follow-up questions. Together they make the agent behave like a conversational assistant rather than a stateless Q&A bot.

---

## Summary Table

| # | File | Type | Root Cause | Fix |
|---|------|------|-----------|-----|
| 1 | `models.py` | Startup crash | Reserved SQLAlchemy attribute name | Renamed to `extra`, kept DB column as `"metadata"` |
| 2 | `sql_tools.py` | Startup crash | sqlglot API renamed `Truncate` → `TruncateTable` | Updated to correct class name |
| 3 | `graph/graph.py` | Startup crash | `asynccontextmanager` used with `await` instead of `__aenter__()` | Entered CM correctly, stored at module level |
| 4 | `routes/chat.py` | Silent bug | AI response never written back to checkpoint | `graph.aupdate_state()` with `AIMessage` after synthesis |
| 5 | `routes/chat.py` | Runtime crash | `datetime` objects not JSON serializable | `_serialize_rows()` converts datetime to ISO string |
| 6 | `routes/chat.py` | Runtime crash | `UUID` objects not JSON serializable | Catch-all `json.dumps()` test + `str()` fallback |
| 7 | `query_agent.py` + `chat.py` | Quality bug | LLM asking for clarification; AIMessage bypass; no conversation history | Disable disambiguation, fix AIMessage detection, pass history |
