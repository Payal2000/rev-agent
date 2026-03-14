# RevAgent

**A production-grade multi-agent AI system for SaaS revenue intelligence.**

RevAgent lets anyone at a SaaS company query, analyze, forecast, and act on their revenue data using natural language — no SQL, no analyst bottleneck, no dashboard wrangling.

Built with LangGraph · FastAPI · Next.js · PostgreSQL · pgvector · OpenAI GPT-4o

<img width="1700" height="941" alt="Screenshot 2026-03-09 at 7 21 41 PM" src="https://github.com/user-attachments/assets/767b3314-3969-4a46-9ce2-0305038d66be" />



## What it does

| Capability | How |
|---|---|
| **Natural language data queries** | Type "What's our MRR by pricing tier?" — converted to safe SQL via pgvector schema RAG, executed, and returned with structured results |
| **Retrieval threshold tuning** | Schema retrieval cutoff tuned to reduce false `INSUFFICIENT_SCHEMA_CONTEXT` errors on core KPI/anomaly prompts |
| **Inline chart generation** | Query results auto-detected as line, bar, or pie charts and rendered directly in the chat response |
| **Proactive anomaly detection** | Z-score analysis on 90-day rolling metrics displayed on the Insights page with severity badges |
| **Revenue forecasting** | Holt-Winters exponential smoothing with 30/60/90-day MRR projections and 80%/95% confidence bands |
| **Actionable recommendations** | RAG-powered playbook retrieves ranked strategies with estimated revenue impact |
| **Human-in-the-loop approvals** | Every recommended action requires explicit approval before execution — rendered as an approval card in the chat UI |
| **Persistent chat sessions** | All sessions stored in PostgreSQL; restored from LangGraph checkpoints; listed in the sidebar with delete support |
| **Multi-turn conversation context** | Query agent receives conversation history so follow-up questions like "show me more" work correctly |
| **Command palette search** | Press ⌘K anywhere to open a spotlight-style search over pages and pre-built AI queries |
| **Collapsible data tables** | Every table across Dashboard, Insights, and Forecasts pages can be collapsed/expanded |
| **Full audit trail** | Every agent decision, SQL query, and approval is logged to PostgreSQL |

<img width="1707" height="944" alt="Screenshot 2026-03-09 at 7 36 41 PM" src="https://github.com/user-attachments/assets/63ebea3c-73d0-4117-abbf-a5994e96f547" />




## Architecture

```
User (Web / Slack / Discord)
         │
         ▼
   FastAPI Backend  ──── SSE streaming ────▶  Next.js Frontend
         │
         ▼
  ┌─────────────────────────────────────────────────────┐
  │               LangGraph StateGraph                  │
  │                                                     │
  │  [Supervisor] ──routes──▶ [Query Agent]             │
  │      ▲                        │                     │
  │      │                   [Insights Agent]           │
  │      │                        │                     │
  │      │                   [Forecast Agent]           │
  │      │                        │                     │
  │      │                   [Action Agent] ──⏸ pause  │
  │      │                        │         (approval)  │
  │      └──────────────── [Validator Agent]            │
  └─────────────────────────────────────────────────────┘
         │
         ▼
  PostgreSQL + pgvector       Redis (Celery)
  (data, checkpoints,         (background tasks,
   embeddings, audit)          scheduled briefings)
```

### The 6 agents

| Agent | Responsibility |
|---|---|
| **Supervisor** | Classifies intent, builds routing plan, aggregates final response |
| **Query Agent** | Converts natural language to safe SQL, validates with sqlglot, executes on read-only DB |
| **Insights Agent** | Computes z-scores across metrics, detects anomalies, generates business explanations |
| **Forecast Agent** | Holt-Winters + linear regression forecasting with confidence intervals |
| **Action Agent** | RAG over playbook + agent memory, ranks recommendations, pauses for human approval |
| **Validator Agent** | Quality and safety checks on all outputs before final response |



## Tech stack

| Layer | Technology |
|---|---|
| **Agent orchestration** | [LangGraph](https://langchain-ai.github.io/langgraph/) — stateful multi-agent graphs, checkpointing, human-in-the-loop interrupts |
| **LLM** | OpenAI GPT-4o — intent classification, SQL generation, narrative writing |
| **Embeddings** | `text-embedding-3-small` via pgvector — schema RAG and playbook retrieval |
| **Backend** | FastAPI + Uvicorn — REST + SSE streaming |
| **Database** | PostgreSQL 16 + pgvector — subscriptions, metrics, embeddings, audit |
| **Frontend** | Next.js 16, React 19, Tailwind CSS 4, Recharts |
| **Task queue** | Celery + Redis + APScheduler — background jobs, daily briefings |
| **SQL safety** | sqlglot — parse-level validation, SELECT-only enforcement |
| **Notifications** | Slack SDK, Discord interactions + webhooks, SendGrid |
| **Observability** | LangSmith — traces, evals, cost monitoring |
| **Payments** | Stripe webhooks — subscription events, invoice sync |



## Project structure

```
rev-agent/
├── backend/
│   ├── agents/              # 6 LangGraph agent modules
│   │   ├── supervisor.py
│   │   ├── query_agent.py
│   │   ├── insights_agent.py
│   │   ├── forecast_agent.py
│   │   ├── action_agent.py
│   │   └── validator_agent.py
│   ├── api/
│   │   ├── main.py          # FastAPI app entry point
│   │   └── routes/
│   │       ├── chat.py      # SSE streaming chat endpoint
│   │       ├── approval.py  # Human-in-the-loop resume endpoint
│   │       ├── webhook.py   # Stripe webhook ingestion
│   │       ├── slack.py     # Slack slash commands + interactions
│   │       └── discord.py   # Discord application commands
│   ├── graph/
│   │   ├── graph.py         # LangGraph StateGraph definition
│   │   └── state.py         # RevAgentState TypedDict
│   ├── tools/
│   │   ├── sql_tools.py     # SQL validation + safe execution
│   │   ├── vector_tools.py  # pgvector schema + playbook search
│   │   ├── slack_tools.py   # Outbound Slack notifications
│   │   ├── discord_tools.py # Outbound Discord webhook notifications
│   │   └── email_tools.py   # SendGrid @tool + briefing senders
│   ├── data/
│   │   ├── models.py        # SQLAlchemy models
│   │   ├── init.sql         # DB init + RLS policies
│   │   └── seed.py          # Demo data seeding
│   ├── tasks/
│   │   ├── celery_app.py    # Celery configuration
│   │   └── scheduled.py     # Daily briefing + insights pipeline
│   ├── config.py            # Pydantic settings
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── app/
│   │   ├── page.tsx         # Chat interface
│   │   ├── dashboard/       # Metrics dashboard
│   │   └── layout.tsx
│   ├── components/
│   │   ├── MessageBubble.tsx
│   │   └── ApprovalCard.tsx # Human-in-the-loop approval UI
│   └── lib/
│       ├── api.ts           # API client + SSE handling
│       └── mockResponses.ts # Demo mode fallbacks
├── docs/                    # Integration reference docs
│   ├── README.md
│   ├── Integrations/
│   │   ├── slack-integration.md
│   │   ├── discord-integration.md
│   │   └── email-langgraph.md
│   └── discord/
│       └── discord_integrated.md
├── docker-compose.yml
├── .env.example
└── README.md
```



## Getting started

### Prerequisites

- Docker + Docker Compose
- Node.js 20+
- Python 3.11+
- OpenAI API key
- Stripe account (or use demo mode)

### 1. Clone and configure

```bash
git clone https://github.com/Payal2000/rev-agent.git
cd rev-agent
cp .env.example .env
```

Edit `.env` with your keys (minimum required: `OPENAI_API_KEY` and `DATABASE_URL`).

### 2. Start the backend stack

```bash
docker compose up -d
```

This starts:
- **PostgreSQL** (port 5432) with pgvector and schema initialized
- **Redis** (port 6379)
- **FastAPI backend** (port 8000) with hot reload
- **Celery worker** — background agent tasks
- **Celery beat** — scheduled daily briefings at 6AM

### 3. Seed demo data

```bash
# Seed subscription and metrics data
docker compose exec backend python data/seed.py

# Seed schema embeddings for SQL RAG (requires OPENAI_API_KEY)
docker compose exec -w /app backend python -m data.seed_schema_embeddings
```

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Generate Stripe test data (CLI synthesis)

To continuously create synthetic Stripe test data and persist it in Postgres for dashboard/chat:

```bash
# Terminal 1: keep webhook forwarding running
stripe listen \
  --events customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed \
  --forward-to localhost:8000/api/webhook/stripe
```

```bash
# Terminal 2: generate mixed Stripe test events and sync to DB
./scripts/stripe_cli_synth.sh 25 00000000-0000-0000-0000-000000000001
```

The script:
- fires Stripe CLI triggers (`customer.subscription.*`, `invoice.*`)
- runs `python -m data.stripe_sync <company_id>` in backend
- prints fresh table counts (`customers`, `subscriptions`, `invoices`, `metrics_daily`, `stripe_webhook_events`)

Run it repeatedly to keep synthetic test data flowing.

### 6. Try it

Open [http://localhost:3000](http://localhost:3000) and navigate to the **Chat** page. Try:

```
What is our MRR this month?
Show me churn rate trends over the last 6 months
Which accounts are at highest risk of churning?
Forecast MRR for the next 90 days
What anomalies were detected this month?
Show subscription breakdown by tier
```

Or press **⌘K** anywhere to open the command palette and pick a pre-built query.



## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/api/chat` | SSE streaming — runs the agent pipeline |
| `POST` | `/api/approve/{session_id}` | Resume a graph paused at approval |
| `GET` | `/api/chat/sessions` | List all chat sessions for the tenant |
| `GET` | `/api/chat/sessions/{id}/messages` | Restore messages for a session from LangGraph checkpoint |
| `DELETE` | `/api/chat/sessions/{id}` | Delete a chat session |
| `GET` | `/api/metrics/summary` | KPI summary with month-over-month deltas |
| `GET` | `/api/metrics/mrr-trend` | MRR waterfall data (last N months) |
| `GET` | `/api/metrics/tier-breakdown` | Subscriber count by tier (Starter/Growth/Enterprise) |
| `GET` | `/api/metrics/at-risk-accounts` | Churn risk table with ML scores |
| `GET` | `/api/insights/anomalies` | Anomaly alerts with severity filter |
| `GET` | `/api/insights/signals` | Revenue signal KPIs |
| `GET` | `/api/forecast/mrr` | Holt-Winters MRR projections with confidence intervals |
| `POST` | `/api/webhook/stripe` | Stripe webhook ingestion |
| `POST` | `/api/slack/events` | Slack slash command handler |
| `POST` | `/api/slack/interactions` | Slack button interaction callbacks |
| `POST` | `/api/discord/interactions` | Discord application command handler |



## Retrieval tuning

RevAgent uses pgvector similarity search to map user questions to schema context before SQL generation.

- Config file: `backend/tools/vector_tools.py`
- Parameter: `SCHEMA_SIMILARITY_THRESHOLD`
- Current value: `0.45`

Tradeoff:
- Threshold too high -> valid prompts can fail with `INSUFFICIENT_SCHEMA_CONTEXT`
- Threshold too low -> weaker context may be passed to SQL generation

The current setting was tuned against real query failures so core prompts like:
- `What is our MRR this month?`
- `Show churn anomalies in the last 30 days`

resolve reliably while still filtering low-similarity matches. See [docs/discord/discord_integrated.md](docs/discord/discord_integrated.md) for the full tuning rationale and methodology.


## Notifications

RevAgent pushes anomaly alerts and daily briefings to three channels simultaneously.

### Slack

- **Outbound:** Anomaly alerts with severity color-coding and Block Kit formatting
- **Inbound:** `/revagent <query>` slash command runs the full agent pipeline
- **Interactive:** Approve or reject recommendations directly from Slack buttons

Setup: create a Slack App, add `/revagent` slash command pointing to `/api/slack/events`, add Interactivity URL pointing to `/api/slack/interactions`.

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_CHANNEL_ID=C...
```

### Discord

- **Outbound:** Anomaly alerts and briefings via Discord webhooks
- **Inbound:** `/revagent` application command via interactions endpoint + deferred follow-up response
- **Response UX improvements:** Summary-first output, currency formatting, date-desc sorting, top-row preview, CSV attachment for large result sets

Setup:
1. Create a Discord Application + Bot
2. Set Interactions Endpoint URL to `https://<your-domain>/api/discord/interactions`
3. Invite app with `bot` + `applications.commands`
4. Register `/revagent` command via Discord API

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_PUBLIC_KEY=...
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
DISCORD_APPLICATION_ID=...
```

### Email

- **Outbound:** Daily HTML briefings and anomaly alerts via SendGrid
- **LangGraph tool:** The Action Agent can also trigger emails directly when it deems an anomaly critical enough

```bash
SENDGRID_API_KEY=SG....
SENDGRID_FROM_EMAIL=noreply@revagent.io
ALERT_EMAIL=ops@yourcompany.com
```

See [docs/](docs/) for full setup guides for each integration.



## How a query flows through the system

```
1. User: "Why did our churn spike last week?"

2. POST /api/chat → SSE stream opens

3. Supervisor Agent
   → intent: "anomaly_check"
   → routing_plan: ["query", "insights", "action"]

4. Query Agent
   → retrieves schema from pgvector
   → generates SQL: SELECT ... FROM subscription_events WHERE ...
   → validates with sqlglot (SELECT-only, tenant_id filter present)
   → executes on read-only DB connection
   → returns: {columns, rows, row_count}

5. Insights Agent
   → fetches 90-day metrics_daily for churn_rate
   → computes z-score: 3.1σ above mean → HIGH severity
   → LLM explains: "Enterprise tier churn up 22% driven by 3 cancellations..."

6. Action Agent
   → searches playbook embeddings: "enterprise churn reduction strategies"
   → searches agent_memory: "similar event 4 months ago, outcome: +$12k MRR"
   → LLM ranks: 1. Proactive outreach (high impact), 2. Pricing audit (medium)
   → ⏸ INTERRUPTS — awaiting human approval

7. Frontend shows ApprovalCard with context + Approve/Reject buttons
   (or Slack shows interactive buttons if query came via /revagent)

8. Human approves → POST /api/approve/{session_id}
   → LangGraph resumes from PostgreSQL checkpoint

9. Validator Agent
   → checks output completeness and quality

10. SSE event "done" → frontend renders full response
```



## Security

- **SQL injection prevention:** sqlglot parse-level validation rejects any non-SELECT statements before execution. Query Agent runs on a read-only DB user with no write permissions.
- **Multi-tenant isolation:** All queries include `WHERE tenant_id = $1`. PostgreSQL Row-Level Security (RLS) enforces this at the DB layer even if application code is bypassed.
- **Slack signatures:** HMAC-SHA256 verification with 5-minute replay window on all inbound Slack requests.
- **Discord signatures:** Ed25519 cryptographic verification (PyNaCl) on all inbound Discord interactions.
- **Secrets:** Never committed. All credentials in `.env` (gitignored). `.env.example` has all keys with placeholder values.



## Environment variables

```bash
# Required
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql+asyncpg://...

# Recommended
READONLY_DATABASE_URL=postgresql+asyncpg://...  # read-only user for Query Agent
LANGCHAIN_API_KEY=ls__...                        # LangSmith observability

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_CHANNEL_ID=C...

# Discord
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_PUBLIC_KEY=...
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
DISCORD_APPLICATION_ID=...

# Email
SENDGRID_API_KEY=SG....
SENDGRID_FROM_EMAIL=noreply@revagent.io
ALERT_EMAIL=ops@yourcompany.com

# Redis + Auth
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=change-this-in-production
```



## Deployment

| Service | Platform |
|---|---|
| Frontend | [Vercel](https://vercel.com) — `cd frontend && vercel deploy` |
| Backend | [Railway](https://railway.app) — connects to Dockerfile, set env vars in dashboard |
| Database | [Supabase](https://supabase.com) or [Neon](https://neon.tech) — PostgreSQL with pgvector |
| Redis | [Upstash](https://upstash.com) — serverless Redis for Celery |

<img width="1681" height="709" alt="Screenshot 2026-03-09 at 8 13 04 PM" src="https://github.com/user-attachments/assets/e4a74f9a-7b6c-4050-838f-c1e8ad9b9345" />



## Documentation

| Doc | Description |
|---|---|
| [docs/Integrations/slack-integration.md](docs/Integrations/slack-integration.md) | Full Slack setup, slash commands, approval flow |
| [docs/Integrations/discord-integration.md](docs/Integrations/discord-integration.md) | Discord webhook + application command setup |
| [docs/discord/discord_integrated.md](docs/discord/discord_integrated.md) | Implemented Discord setup, threshold tuning, and formatting improvements |
| [docs/Integrations/email-langgraph.md](docs/Integrations/email-langgraph.md) | Email patterns in LangGraph, SendGrid setup |
| [docs/Overview/RevAgent_Complete_Blueprint.md](docs/Overview/RevAgent_Complete_Blueprint.md) | Full technical blueprint and design decisions |
| [docs/Bugs/BUGS_AND_ERRORS.md](docs/Bugs/BUGS_AND_ERRORS.md) | Bugs encountered during development with root cause analysis and solutions |


## Author

**Payal Nagaonkar**
[github.com/Payal2000](https://github.com/Payal2000)
