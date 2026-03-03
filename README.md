# RevAgent

**A production-grade multi-agent AI system for SaaS revenue intelligence.**

RevAgent lets anyone at a SaaS company query, analyze, forecast, and act on their revenue data using natural language — no SQL, no analyst bottleneck, no dashboard wrangling.

Built with LangGraph · FastAPI · Next.js · PostgreSQL · pgvector · OpenAI GPT-4o


## What it does

| Capability | How |
|---|---|
| **Natural language data queries** | Type "What's our MRR by pricing tier?" — gets converted to safe SQL, executed, and returned with structured results |
| **Proactive anomaly detection** | Z-score analysis on 90-day rolling metrics. Alerts fire on Slack, Discord, and email automatically |
| **Revenue forecasting** | Holt-Winters exponential smoothing + LLM narrative for 30/60/90-day MRR and churn projections |
| **Actionable recommendations** | RAG-powered playbook retrieves ranked strategies with estimated revenue impact |
| **Human-in-the-loop approvals** | Every recommended action requires explicit approval before execution — from the web UI, Slack, or Discord |
| **Full audit trail** | Every agent decision, SQL query, and approval is logged to PostgreSQL |



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
| **Notifications** | Slack SDK, Discord webhooks, SendGrid |
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
│   ├── slack-integration.md
│   ├── discord-integration.md
│   └── email-langgraph.md
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
docker compose exec backend python data/seed.py
```

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Try it

```
What is our MRR this month?
Show me churn anomalies in the last 7 days
Forecast revenue for the next 90 days
What are the top strategies to reduce churn?
```



## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/api/chat` | SSE streaming — runs the agent pipeline |
| `POST` | `/api/approve/{session_id}` | Resume a graph paused at approval |
| `GET` | `/api/approval/{session_id}/status` | Check if a session is awaiting approval |
| `POST` | `/api/webhook/stripe` | Stripe webhook ingestion |
| `POST` | `/api/slack/events` | Slack slash command handler |
| `POST` | `/api/slack/interactions` | Slack button interaction callbacks |
| `POST` | `/api/discord/interactions` | Discord application command handler |



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

- **Outbound:** Anomaly alerts and briefings via Discord webhooks (no bot required)
- **Inbound:** `/revagent` application command with deferred response pattern

Setup: create a Discord Application, register `/revagent` command via API, set Interactions Endpoint URL to `/api/discord/interactions`.

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_PUBLIC_KEY=...
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


## Documentation

| Doc | Description |
|---|---|
| [docs/slack-integration.md](docs/slack-integration.md) | Full Slack setup, slash commands, approval flow |
| [docs/discord-integration.md](docs/discord-integration.md) | Discord webhook + application command setup |
| [docs/email-langgraph.md](docs/email-langgraph.md) | Email patterns in LangGraph, SendGrid setup |
| [RevAgent_Complete_Blueprint.md](RevAgent_Complete_Blueprint.md) | Full technical blueprint and design decisions |


## Author

**Payal Nagaonkar**
[github.com/Payal2000](https://github.com/Payal2000)
