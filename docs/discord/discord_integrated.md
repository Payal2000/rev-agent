# Discord Integration - Implemented Guide

## Overview
This document captures what is implemented for Discord in RevAgent and why specific tuning decisions were made.

Implemented scope:
- Inbound slash command integration (`/revagent`)
- Discord interaction endpoint verification (Ed25519)
- Bot invite and command registration
- Local tunnel workflow for Docker-based local development
- Retrieval threshold tuning for query-to-schema matching
- Discord output improvements (summary, currency, sorting, CSV attachment)

## Implementation Summary

### Inbound endpoint
- Route: `POST /api/discord/interactions`
- File: `backend/api/routes/discord.py`
- Behavior:
  - Responds to Discord `PING` with `PONG`
  - Handles `/revagent` command
  - Returns deferred response immediately, sends result via follow-up webhook

### Signature verification
- Uses `DISCORD_PUBLIC_KEY` to verify request signatures
- If key is missing, Discord endpoint validation can fail in app settings

### Local development path
- Backend: Docker on `localhost:8000`
- Public ingress (local): Cloudflare quick tunnel
  - `cloudflared tunnel --url http://localhost:8000`
- Interactions URL in Discord app settings:
  - `https://<public-tunnel-domain>/api/discord/interactions`

### Required env variables
Set in project root `.env`:

```bash
DISCORD_PUBLIC_KEY=...
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
DISCORD_APPLICATION_ID=...
DISCORD_WEBHOOK_URL=...   # optional for outbound notifications
DISCORD_CHANNEL_ID=...    # optional
```

Note: if `.env` changes are not reflected in container env, recreate backend container:

```bash
docker compose up -d --force-recreate backend
```

## Retrieval Threshold Tuning (Primary Engineering Decision)

### Problem observed
Valid KPI-style queries were rejected with `INSUFFICIENT_SCHEMA_CONTEXT`:
- `What is our MRR this month?`
- `Show churn anomalies in the last 30 days`

Root cause:
- `search_schema()` filtered candidates by similarity threshold.
- Best-match similarities for valid queries were below initial cutoff.

### Measured scores in this codebase
From local checks against `schema_embeddings`:
- `What is our MRR this month?` -> best similarity ~= `0.533` (`metrics_daily`)
- `Show churn anomalies in the last 30 days` -> best similarity ~= `0.495` (`metrics_daily`)

### Threshold evolution
File: `backend/tools/vector_tools.py`
- Initial: `SCHEMA_SIMILARITY_THRESHOLD = 0.55`
- First tuning: `0.50`
- Final tuning: `0.45`

Why final `0.45`:
- `0.50` fixed MRR but still rejected churn-anomaly query (`0.495`)
- `0.45` keeps both valid query classes while still excluding clearly weak matches

### Precision vs recall tradeoff (why this matters)
Lowering threshold increases recall (fewer false rejects) but can reduce precision (more weak contexts passed through). For retrieval systems, this is an explicit operating-point choice.

In this system we selected a higher-recall operating point because:
- SQL safety and tenant checks are enforced downstream
- Query agent still receives top-k ranked schema context
- User-visible failure mode (`INSUFFICIENT_SCHEMA_CONTEXT`) was too aggressive for core KPI prompts

### Research-backed guidance used
1. Retrieval thresholds are operating points
- Precision-recall tradeoff changes with threshold; lower threshold generally improves recall and can hurt precision.

2. pgvector scoring semantics
- Current query uses cosine distance operator `<=>` and converts to similarity as `1 - distance`.
- pgvector exact search provides full recall; ANN indexing trades recall for speed.

3. Embedding distance choice
- OpenAI embeddings are unit-normalized; cosine similarity is recommended and cosine/euclidean ranking is equivalent for normalized vectors.

### Practical tuning method used here
- Step 1: Collect failed real user queries
- Step 2: Inspect top similarity scores for best table match
- Step 3: Lower threshold minimally until those queries pass
- Step 4: Re-test previous successful queries
- Step 5: Keep guardrails (SQL safety + tenant isolation) intact

### Recommended next hardening
- Add a small offline eval set (20-50 common business prompts)
- Track:
  - retrieval recall@1 for expected table
  - false-accept rate (low relevance context passed)
  - `INSUFFICIENT_SCHEMA_CONTEXT` rate in production logs
- Consider dynamic thresholding by intent class:
  - KPI queries: slightly lower threshold
  - ambiguous open-ended queries: slightly higher threshold

## Discord Output Improvements Implemented
File: `backend/api/routes/discord.py`

1. Summary-first response
- Row count
- Date range
- Churn summary when available:
  - total churn count
  - avg/day churn count
  - spike day(s)
  - total churn MRR
  - avg/day churn MRR

2. Better numeric formatting
- Currency formatting for revenue fields (`mrr`, `arr`, `revenue`, `amount`, `arpu`)

3. Sorted + compact preview
- Auto sort by date-like column descending
- Show top 10 rows in message body

4. CSV attachment for long outputs
- If result set >10 rows, attach full CSV
- Message includes compact preview + summary

## Current Verified Behavior
- `/revagent query: What is our MRR this month?` -> returns valid KPI data
- `/revagent query: Show churn anomalies in the last 30 days` -> returns valid churn data

## Operations Checklist
- Keep Docker backend running
- Keep tunnel process running for local testing
- If tunnel domain changes, update Discord Interactions Endpoint URL
- If validation fails, check backend logs and confirm `DISCORD_PUBLIC_KEY` is present in container env

Useful commands:

```bash
docker compose logs -f backend
```

```bash
docker compose exec -T backend /bin/sh -lc 'env | grep "^DISCORD_PUBLIC_KEY="'
```

```bash
docker compose up -d --force-recreate backend
```

## References
- pgvector README (distance operators, similarity conversion, recall/speed tradeoff): https://github.com/pgvector/pgvector
- OpenAI Embeddings FAQ (distance choice, normalized embeddings): https://platform.openai.com/docs/guides/embeddings/faq
- scikit-learn Precision-Recall (threshold operating points): https://scikit-learn.org/1.2/auto_examples/model_selection/plot_precision_recall.html
- LangChain vectorstore relevance-score threshold behavior: https://api.python.langchain.com/en/latest/_modules/langchain_core/vectorstores/base.html
