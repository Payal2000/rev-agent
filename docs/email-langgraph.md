# Email via LangGraph

**Author:** Payal Nagaonkar
**Project:** RevAgent
**Date:** March 2026

---

## Overview

RevAgent uses SendGrid for email notifications, integrated in two ways:

1. **LangChain `@tool`** — The Action Agent can decide to send an email during graph execution when a critical anomaly or recommendation warrants direct notification
2. **Standalone async functions** — Used by Celery scheduled tasks for daily briefings and threshold-triggered alerts (non-blocking, retryable)

---

## Does LangGraph Have Built-In Email Support?

**No.** LangGraph is a graph orchestration framework — it handles stateful agent routing, checkpointing, and interrupts. Email (and all domain-specific tools) live outside the framework.

However, LangGraph's `ToolNode` abstraction means any Python function decorated with `@tool` from LangChain can be used inside a graph, including email senders.

LangChain community (`langchain-community`) does provide Gmail OAuth tools:
- `GmailSendMessage`
- `GmailCreateDraft`
- `GmailSearch`

RevAgent uses SendGrid instead (already configured) wrapped as a custom `@tool`.

---

## Architecture

```
LangGraph Pipeline
    │
    └── Action Agent
            │
            ├── [tool call] send_alert_email(to, subject, body)
            │       │
            │   SendGrid API
            │
            └── [on high-severity] → email queued
                    │
                Celery task (fire-and-forget)
```

```
Celery Beat (daily 6AM)
    │
    └── run_daily_briefing task
            │
            ├── Slack  → send_daily_briefing()
            ├── Discord → discord send_daily_briefing()
            └── Email  → send_daily_briefing_email()
                                │
                            SendGrid HTML email
```

---

## Files

| File | Purpose |
|------|---------|
| `backend/tools/email_tools.py` | `@tool`, standalone senders, SendGrid wrapper, HTML formatter |

---

## Using Email as a LangChain Tool

The `send_alert_email` tool is available to any agent that imports it. The LLM decides when to call it based on the docstring description.

### How It Works

```python
from langchain_core.tools import tool

@tool
def send_alert_email(to_email: str, subject: str, body: str) -> str:
    """
    Send an email alert to a user about a revenue anomaly, forecast, or recommendation.
    Use this when the analysis reveals a critical issue that warrants direct notification.
    """
    ...
```

The Action Agent includes this in its tool list. When the LLM determines an issue is severe enough to warrant email (based on the docstring), it calls the tool automatically.

### Registering with an Agent

```python
from tools.email_tools import send_alert_email
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

llm = ChatOpenAI(model="gpt-4o")
agent = create_react_agent(model=llm, tools=[send_alert_email, other_tools...])
```

Or in the existing StateGraph pattern, add it to the Action Agent's tool list:

```python
# agents/action_agent.py
from tools.email_tools import send_alert_email

tools = [search_playbook, search_memory, send_alert_email]
```

---

## Standalone Email Functions

These are called directly from Celery tasks or webhook handlers — they don't go through LangGraph.

### Daily Briefing Email

```python
from tools.email_tools import send_daily_briefing_email

await send_daily_briefing_email(
    briefing_text="...",
    to_email="cfo@company.com"  # optional, falls back to ALERT_EMAIL
)
```

Sends an HTML-formatted email with section headers rendered as `<h3>` and bullet points as `<li>`.

### Anomaly Alert Email

```python
from tools.email_tools import send_anomaly_alert_email

await send_anomaly_alert_email(
    metric_name="MRR",
    explanation="MRR dropped 18% — 3.2σ below the 90-day mean.",
    severity="high",
    z_score=3.2,
    to_email="alerts@company.com"  # optional, falls back to ALERT_EMAIL
)
```

---

## Environment Variables

```bash
SENDGRID_API_KEY=SG.xxx...
SENDGRID_FROM_EMAIL=noreply@revagent.io   # sender address (must be verified in SendGrid)
ALERT_EMAIL=ops@yourcompany.com           # default recipient for system alerts
```

**SendGrid setup:**
1. Create account at [sendgrid.com](https://sendgrid.com)
2. Verify your sender domain or email address
3. Create an API key with **Mail Send** permission only
4. Add to `.env`

---

## Email vs Celery — When to Use Each

| Use case | Pattern |
|---|---|
| LLM decides when to send (agent-driven) | `@tool` → Action Agent calls it |
| Always send on anomaly (deterministic) | Standalone function in webhook handler |
| Daily briefing (scheduled) | Celery beat task calls `send_daily_briefing_email()` |
| High volume / need retries | Wrap in a Celery task for fire-and-forget |

### Fire-and-Forget with Celery

If email send must not block the LangGraph execution:

```python
# tasks/celery_app.py — add a Celery task
@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_email_task(self, to_email, subject, body):
    from tools.email_tools import _send_via_sendgrid
    success = _send_via_sendgrid(to_email, subject, body)
    if not success:
        raise self.retry()

# In a LangGraph tool:
@tool
def send_alert_email_async(to_email: str, subject: str, body: str) -> str:
    """Queue a critical email alert for background delivery."""
    from tasks.celery_app import send_email_task
    send_email_task.delay(to_email, subject, body)
    return f"Email queued for {to_email}"
```

---

## HTML Email Format

The `send_daily_briefing_email()` function converts plain-text briefings to HTML:

```
*Today's Revenue Snapshot:*     →   <h3>Today's Revenue Snapshot:</h3>
• MRR: $124,800                 →   <li>MRR: $124,800</li>
Regular paragraph text           →   <p>Regular paragraph text</p>
```

Preview:

```
┌─────────────────────────────────────────────┐
│ 📊 Daily Revenue Briefing                   │
│                                             │
│ Today's Revenue Snapshot:                   │
│ • MRR: $124,800                             │
│ • ARR: $1,497,600                           │
│                                             │
│ Anomalies Detected: 1                       │
│ • Churn Rate: increased 2.1% vs last week   │
│                                             │
│ Forecast: MRR projected at $128k by Q2 end  │
│                                             │
│ ─────────────────────────────────────────── │
│ Sent by RevAgent · Revenue Intelligence     │
└─────────────────────────────────────────────┘
```

---

## Comparison: Email Patterns in LangGraph

| Pattern | File | Trigger | Blocking? |
|---|---|---|---|
| `@tool` (LLM-triggered) | `email_tools.py` | LLM decides during graph run | Yes (sync SendGrid call) |
| Standalone async | `email_tools.py` | Celery task / webhook | No (async, awaited) |
| Celery task | `tasks/celery_app.py` | Background job | No (fire-and-forget) |
| Gmail OAuth tool | `langchain_community` | LLM via ToolNode | Yes |
