# RAG Tradeoffs

Every retrieval design decision in RevAgent involves a tradeoff. This document records what each decision optimizes for, what it sacrifices, and what signals to watch to know if the balance is wrong.

---

## 1. Similarity Threshold (0.55 schema / 0.55 playbook / 0.50 memory)

### What it solves
Before thresholds, every `top_k` result was passed to the LLM regardless of how weakly it matched the question. The LLM would generate SQL or recommendations anchored to irrelevant context — confidently wrong rather than visibly uncertain.

### The tradeoff
| | Before (no threshold) | After (threshold = 0.55) |
|---|---|---|
| Legitimate question, good match | Answers correctly | Answers correctly |
| Legitimate question, weak match | Attempts answer, may hallucinate | Refuses, asks to rephrase |
| Off-topic question | Generates plausible but wrong answer | Refuses cleanly |

**The failure you're trading in:** silent wrong answers.
**The failure you're trading for:** false refusals on legitimate questions phrased in non-standard language.

### When to lower the threshold
Watch the warning logs:
```
[VectorTools] schema search returned no results above threshold 0.55
for query: '...' (best score: 0.48)
```
If you see best scores consistently in the 0.45–0.54 range for questions that *should* work (e.g. "show me logos at risk"), the threshold is too aggressive. Lower to 0.45.

### When to raise the threshold
If you see the agent generating queries against wrong tables (e.g. joining `audit_log` to answer a churn question), the threshold is too permissive. Raise to 0.60.

### What 0.55 assumes
That `text-embedding-3-small` produces cosine similarities above 0.55 for semantically relevant matches in your domain. This was chosen as a reasonable starting point — **it has not been calibrated against RevAgent's actual query distribution.** Treat it as provisional until you have 2–4 weeks of query logs.

---

## 2. Business-Document Chunking vs. Token-Based Chunking

### What it solves
Token-based chunking (split every N tokens with overlap) would fragment a schema description, separating the table purpose from its column definitions and query patterns. The LLM would retrieve three partial fragments instead of one coherent document, losing the context that ties column names to business meaning.

### The tradeoff
| | Token-based chunks | Business-document chunks (current) |
|---|---|---|
| Corpus size | Scales to any size | Only works for small, curated corpora |
| Update friction | Re-chunk and re-embed on any change | Must manually maintain document quality |
| Retrieval precision | Can retrieve sub-document context | Always retrieves the full document |
| Context bloat | Smaller chunks, less LLM context used | Full documents use more prompt tokens |

### The hidden assumption
Business-document chunking only works because the RevAgent corpus is small and stable — 9 schema documents and 7 playbook entries. If the playbook grows to 200 entries or schema docs become very long, this approach will cause context bloat (too many tokens per document) and retrieval noise (top_k brings in too much irrelevant detail per hit). At that scale, token-based chunking with a cross-encoder reranker becomes the right approach.

---

## 3. Memory 180-Day Recency Window

### What it solves
Without a recency window, agent memories accumulated indefinitely. A failed recommendation from 14 months ago, or a preference noted when the company was half its current size, remained in the retrieval pool with equal weight to recent memories.

### The tradeoff
| | No recency window | 180-day window (current) |
|---|---|---|
| Fresh-start companies (<6 months) | No difference | No difference |
| Established companies | Institutional memory compounds over time | Memory resets every 6 months |
| Seasonal patterns (annual contracts) | Agent learns year-over-year patterns | Agent cannot see beyond 180 days |

### When 180 days is wrong

**Too short:** If your customers operate on annual procurement cycles, 180 days cuts off the second half of the cycle. The agent loses context about what happened at contract renewal time. Raise to 365 days.

**Too long:** If your business moves fast (PLG, high-velocity SMB), a 6-month-old memory about a customer's preferences may actively mislead. Lower to 90 days.

### What isn't addressed
The recency window is a blunt instrument — it treats a memory from day 179 the same as one from day 1, and drops a memory from day 181 entirely. A better approach would be recency-weighted scoring that decays similarity scores by age. That's not implemented.

---

## 4. Playbook as Code vs. Playbook as Database

### What it solves
Storing playbook entries in code (`schema_embeddings.py`) makes the seeder the single source of truth. Versioning, review, and rollback go through Git. Before the upsert fix, the database was effectively the source of truth (since edits to code were ignored), but with no versioning.

### The tradeoff
| | Playbook in code (current) | Playbook in database |
|---|---|---|
| Versioning | Git history | No history by default |
| Updating an entry | Edit Python file + re-seed | Direct DB update (instant, no re-embed needed... wait, re-embed *is* needed) |
| Non-technical editors | Must edit Python and trigger a deploy | Could use an admin UI |
| Risk of divergence | Code and DB stay in sync (upsert overwrites) | DB can drift from intended state |

### The key implication
**Any direct database edit to `rag_playbook` will be overwritten on the next seed run.** Code is authoritative. If a CS manager edits a playbook entry via psql to adjust success rates, that edit disappears the next time `embed_and_store_playbook()` runs. This is by design — but it must be communicated to anyone with DB access.

---

## 5. Hard Refusal vs. Low-Confidence Answer

### What it solves
When schema retrieval returns nothing above threshold, the query agent now refuses entirely (`INSUFFICIENT_SCHEMA_CONTEXT`) rather than attempting SQL generation. This prevents the LLM from hallucinating table or column names.

### The tradeoff
**Hard refusal (current):** User gets a clear error message and must rephrase. The system never produces a wrong answer for this class of failure.

**Low-confidence answer (alternative):** Agent attempts SQL, includes a disclaimer ("I'm not confident this is right"), and lets the user judge. More useful if the question is borderline; more dangerous if the user ignores the disclaimer.

### Why hard refusal was chosen
Revenue data drives real business decisions. A wrong MRR figure or an incorrect churn count presented with even a soft disclaimer can propagate into board decks, investor reports, or compensation calculations. The cost of a wrong answer is higher than the cost of asking the user to rephrase.

### Where this could be reconsidered
For exploratory queries ("I wonder if there's a correlation between..."), a low-confidence attempt with clear uncertainty signaling might be more useful. If the product evolves toward exploratory analytics rather than operational decision support, the refusal threshold could be lowered or replaced with a tiered response (attempt + explicit uncertainty).

---

## 6. Shared Knowledge Stores (No Per-Tenant Playbook or Schema)

### What it solves
All tenants share the same `schema_embeddings` and `rag_playbook` tables. This is simpler to maintain — one set of schema docs, one set of strategies.

### The tradeoff
| | Shared (current) | Per-tenant |
|---|---|---|
| Maintenance | One update affects all tenants | Updates scoped per tenant |
| Customization | None — all tenants see same strategies | Tenants can have custom playbooks |
| Competitive sensitivity | All tenants implicitly use the same strategy playbook | Proprietary strategies per tenant |
| Isolation | Logical (RLS doesn't apply here) | Full isolation |

### The gap this creates
A large Enterprise tenant might want custom playbook entries reflecting their specific go-to-market motion. Currently impossible without adding a `company_id` (nullable) column to `rag_playbook` and a second retrieval pass that merges global + tenant-specific results.

---

## Summary: Which tradeoffs are provisional vs. deliberate

| Decision | Type | Revisit when |
|---|---|---|
| Threshold = 0.55 | **Provisional** — not calibrated | After 2–4 weeks of query logs |
| Business-document chunking | **Deliberate** — right for this corpus size | Playbook grows beyond ~50 entries |
| 180-day memory window | **Provisional** — not calibrated to contract cycles | After understanding customer contract lengths |
| Playbook as code | **Deliberate** — Git as source of truth | If non-technical editors need self-serve updates |
| Hard refusal on no schema | **Deliberate** — safety over recall | If product shifts to exploratory analytics |
| Shared knowledge stores | **Deliberate** — simplicity | If Enterprise tenants need custom strategies |
