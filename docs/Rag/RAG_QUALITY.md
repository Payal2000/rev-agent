# RAG Quality, Retrieval Tuning & Context Safety

This document covers how RevAgent controls the quality of its retrieval-augmented generation (RAG) pipeline from ingestion through retrieval to what the LLM is allowed to act on. It maps directly to the five failure modes identified during a quality review: ingestion quality, chunking/retrieval tuning, stale documents, access controls, and confident wrong-context surfacing.

---

## 1. Ingestion Quality

### What we store and how

RevAgent has three vector stores, each with a distinct ingestion model:

| Store | Table | Source | Update strategy |
|---|---|---|---|
| Schema docs | `schema_embeddings` | Hand-authored, one entry per DB table | Upsert on `table_name` — re-seed always overwrites |
| Revenue playbook | `rag_playbook` | Curated strategy entries | Upsert on `title` — re-seed updates content **and** re-embeds |
| Agent memory | `agent_memory` | Written by agents at runtime | Append-only; filtered by recency and similarity at retrieval time |

### Schema documents

Rather than auto-generating embeddings from raw DDL, each schema "document" is a hand-authored business-context description that includes:

- **Purpose** — what the table represents in business terms
- **Key columns** — with domain meanings (e.g. `status='active'` means paying subscriber)
- **Common query patterns** — concrete SQL fragments the Query Agent should build on

This is intentional. Embedding raw `CREATE TABLE` output produces low-quality retrieval because column names alone carry little semantic signal. A question like "what's our churn rate?" maps poorly to `canceled_at TIMESTAMP NULL` but maps well to a description that explains what cancellation means.

**Staleness risk:** If the schema changes (column added, renamed, or removed), the hand-authored doc must be updated and the seeder re-run. There is currently no automated trigger for this — it is a manual process. The `updated_at` column on `schema_embeddings` records when each doc was last re-embedded, which makes drift visible.

### Playbook documents

Seven curated strategy entries covering churn reduction, expansion, and pricing. Each entry includes a specific action, success rate, estimated revenue impact, and required approvals.

**Previously broken:** The upsert used `on_conflict_do_nothing()`, meaning any edit to playbook content was silently ignored on re-seed. This is fixed — the upsert now uses `on_conflict_do_update` on `title`, refreshing `content`, `embedding`, `category`, `estimated_impact`, `tags`, and `updated_at` on every seed run.

---

## 2. Chunking & Retrieval Tuning

### Chunking strategy

RevAgent does not use token-based chunking. Each "chunk" is a complete business document — one per table or one per playbook strategy. This was a deliberate choice:

- Token-based splitting would fragment query patterns away from their table context
- A single coherent document is easier for the LLM to reason about than three partial fragments
- The corpus is small enough that full-document embedding is practical

### Similarity thresholds

All three retrieval functions apply a minimum similarity threshold before returning results. Results below the threshold are dropped at the retrieval layer — they never reach the LLM prompt.

| Store | Threshold | Rationale |
|---|---|---|
| `search_schema` | 0.55 | Below this, the retrieved table is likely irrelevant to the question — SQL generation will hallucinate |
| `search_playbook` | 0.55 | Below this, the strategy doesn't match the anomaly situation — forces the LLM to generate misleading recommendations |
| `search_agent_memory` | 0.50 | Slightly lower because memory entries are more varied in phrasing; still filters clear misses |

**If no results meet the threshold**, the function returns an empty list and logs a warning with the best score seen. Callers handle empty retrieval explicitly — see §5 below.

### `top_k` settings

- Schema: `top_k=5` — retrieves up to 5 tables; typically 2-3 are relevant per question
- Playbook: `top_k=5` — retrieves up to 5 strategies for ranking
- Memory: `top_k=3` — limits to 3 past memories to avoid context bloat

---

## 3. Stale Document Handling

### Schema embeddings

- **`updated_at` column** records the last re-embed timestamp on every `schema_embeddings` row
- On re-seed, the upsert sets `updated_at = NOW()`, so stale rows are identifiable
- If a database migration adds or renames columns, the schema doc must be updated in `data/schema_embeddings.py` and the seeder re-run: `docker compose exec -w /app backend python -m data.schema_embeddings`
- There is no automated drift detection — this remains a manual responsibility. A future improvement would be to compare `updated_at` against the timestamp of the last Alembic migration and alert on mismatch.

### Playbook entries

- `updated_at` is set on every upsert, so you can see when content was last refreshed
- Because upserts now overwrite content, editing a playbook entry in code and re-seeding is sufficient to update both the stored text and its embedding

### Agent memory

Memory is append-only (agents write new entries; nothing is edited). Two staleness controls apply at retrieval time:

- **Recency window:** Only memories from the last 180 days are queried (`created_at >= NOW() - make_interval(days => 180)`). Older memories may reflect outdated company conditions or resolved issues.
- **Outcome field:** Each memory has an `outcome` (successful / failed / pending). The LLM prompt receives outcome alongside the memory text, so it can discount failed strategies.

There is no automatic TTL or purge. The 180-day window is enforced in the query; records older than that remain in the table but are never surfaced.

---

## 4. Access Controls

### Row-Level Security (RLS)

All multi-tenant tables — including `agent_memory` — have PostgreSQL Row-Level Security enabled at database initialization:

```sql
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_memory
    USING (company_id::text = current_setting('app.current_tenant', true));
```

Every request sets the session-level tenant context before any query runs:

```sql
SELECT set_config('app.current_tenant', '<tenant_uuid>', true)
```

This means even if application code contains a bug that omits a `WHERE company_id = ?` clause, the database itself will silently filter to the correct tenant's rows. RLS is the last line of defence.

### Agent memory is double-guarded

`search_agent_memory()` enforces `company_id` in the SQL query **and** relies on RLS. The explicit filter ensures the intent is clear in code; RLS ensures it cannot be bypassed.

### Shared knowledge stores

`schema_embeddings` and `rag_playbook` are intentionally global — they contain schema knowledge and strategy playbooks that apply to all tenants. There is no per-tenant customisation of these stores today. If a tenant required custom schema docs or private playbook entries, a `company_id` column and corresponding RLS policy would need to be added to those tables.

### Chat sessions and conversation history

Chat sessions are scoped to `company_id`. The session restoration endpoint (`GET /chat/sessions/{session_id}/messages`) validates that the requested session belongs to the requesting tenant via the `TenantDep` dependency before accessing LangGraph checkpoint state.

---

## 5. Preventing Confident Wrong-Context Responses

This is the hardest problem in the pipeline. Several layered controls address it:

### Layer 1 — Similarity threshold at retrieval (vector_tools.py)

The retrieval functions drop below-threshold results before they reach any agent. If `search_schema` returns an empty list, the Query Agent cannot proceed to SQL generation.

### Layer 2 — Hard early exit in Query Agent (query_agent.py)

If `search_schema` returns no results, the Query Agent returns an explicit error state immediately:

```
INSUFFICIENT_SCHEMA_CONTEXT: The question doesn't map to any known database tables
with sufficient confidence. Please rephrase or ask about metrics, subscriptions,
revenue, churn, or customers.
```

This message surfaces to the user. The agent does **not** attempt SQL generation with empty or weak schema context.

### Layer 3 — Similarity scores in the LLM prompt (query_agent.py, action_agent.py)

Every schema section and playbook entry passed to the LLM includes its similarity score:

```
--- subscriptions (similarity: 0.82) ---
--- metrics_daily (similarity: 0.71) ---
--- customers (similarity: 0.58) ---
```

The system prompt instructs the LLM:

> "Scores below 0.65 are labeled WEAK MATCH. Prefer higher-scoring tables. If all scores are below 0.65, set confidence < 0.5 and explain your uncertainty."

This means the LLM's own `confidence` field in the SQL generation tool reflects retrieval quality, not just its certainty about SQL syntax.

### Layer 4 — Playbook weak-match flagging (action_agent.py)

Playbook entries with similarity < 0.65 are labeled `WEAK MATCH, use with caution` in the prompt. The system prompt instructs the LLM to qualify any recommendation derived from a weak-match entry rather than presenting it as a confident best practice.

If no playbook entries meet the threshold, the context explicitly states:

> "No closely matching playbook strategies found. Generate conservative first-principles advice and explicitly state that no playbook match was found."

### Layer 5 — SQL validation before execution (validator_agent.py)

Before any SQL runs, the Validator Agent checks the generated query for safety and structural correctness. This catches cases where the LLM generated structurally plausible but semantically wrong SQL.

### Layer 6 — Human-in-the-loop on Action Agent recommendations

The Action Agent always pauses for human approval before any recommendation is treated as actionable. A human sees the anomaly context, the recommendations, and can modify or reject them. This is the final gate against confidently wrong automated actions.

### Layer 7 — Conversation context window trimming (graph/state.py)

Conversation history is trimmed to the last 8 turns (`max_turns=8`). This prevents old conversation context — which may have involved different questions or different data states — from polluting the current query's context window.

---

## Known Gaps (Not Yet Addressed)

| Gap | Risk | Suggested fix |
|---|---|---|
| No schema drift alert | Schema embedding goes stale after a migration | Compare `schema_embeddings.updated_at` vs latest Alembic migration timestamp at startup; log a warning |
| No query result shape validation | LLM might generate SQL that returns the right rows but wrong columns for the question | Post-execution step: verify result columns match question intent (e.g. a "revenue" question should return numeric columns) |
| Memory outcome field not auto-updated | Memories with `outcome='pending'` stay pending forever unless the agent explicitly updates them | Add a background job or agent step that resolves `pending` memories after a configurable time window |
| No per-tenant playbook | All tenants share the same 7 strategies | Add `company_id` (nullable) to `rag_playbook` to allow tenant-specific entries alongside global ones |
| Similarity thresholds are fixed | A threshold that works for schema may be wrong for future content additions | Consider making thresholds configurable via `config.py` settings |
