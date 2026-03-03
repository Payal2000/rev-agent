# Discord Integration

**Author:** Payal Nagaonkar
**Project:** RevAgent
**Date:** March 2026

---

## Overview

RevAgent's Discord integration enables revenue alerts and agent queries from Discord:

- **Outbound** — Anomaly alerts and daily briefings posted to a Discord channel via webhook (no bot required)
- **Inbound** — The `/revagent` Discord application command runs the full agent pipeline and responds in-channel

---

## Architecture

```
Discord Server
    │
    ├── /revagent <query>  ──→  POST /api/discord/interactions
    │                               │
    │                           Ed25519 signature verification
    │                               │
    │                           Deferred response (PONG within 3s)
    │                               │
    │                           LangGraph pipeline (background)
    │                               │
    │                     ←──  Follow-up webhook POST
    │
    └── Outbound alerts         discord_webhook_url
            │                       │
        send_anomaly_alert()    Embed with severity color + fields
        send_daily_briefing()   Embed with briefing text
```

---

## Files

| File | Purpose |
|------|---------|
| `backend/tools/discord_tools.py` | Outbound: webhook-based alerts and briefings |
| `backend/api/routes/discord.py` | Inbound: application command handler |

---

## Outbound — Webhook Notifications

Discord webhooks are the simplest way to send messages — no bot token required, just a webhook URL from a channel's settings.

### Anomaly Alert

```python
from tools.discord_tools import send_anomaly_alert

await send_anomaly_alert(
    metric_name="Churn Rate",
    explanation="Churn rate jumped to 8.2% — 2.9σ above the 90-day mean.",
    severity="high",          # low | medium | high | critical
    z_score=2.9,
    webhook_url="https://discord.com/api/webhooks/..."  # optional override
)
```

Message format: Discord embed with severity color coding:

| Severity | Color |
|---|---|
| low | 🟡 Yellow `#FFCC00` |
| medium | 🟠 Orange `#FF8800` |
| high | 🔴 Red `#FF2200` |
| critical | 🚨 Dark Red `#990000` |

### Daily Briefing

```python
from tools.discord_tools import send_daily_briefing

await send_daily_briefing(briefing_text)
```

Posted as a Discord blurple embed. Called automatically by the Celery daily briefing task alongside Slack and Email.

---

## Inbound — Slash Command

### Setup

#### 1. Create a Discord Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** → name it "RevAgent"
3. Go to **Bot** → add a bot, copy the **Bot Token**
4. Go to **General Information** → copy the **Public Key**

#### 2. Register the Slash Command

Register the `/revagent` command with Discord's API (run once):

```bash
curl -X POST \
  "https://discord.com/api/v10/applications/{APPLICATION_ID}/guilds/{GUILD_ID}/commands" \
  -H "Authorization: Bot {BOT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "revagent",
    "description": "Query your revenue data with AI",
    "options": [{
      "type": 3,
      "name": "query",
      "description": "Your revenue question",
      "required": true
    }]
  }'
```

#### 3. Set Interaction Endpoint URL

In Discord Developer Portal → **General Information** → **Interactions Endpoint URL**:

```
https://your-domain.com/api/discord/interactions
```

Discord will send a `PING` to verify — the endpoint responds with `PONG` automatically.

#### 4. Invite the Bot

Generate an invite URL from the **OAuth2** tab with `applications.commands` scope.

### Environment Variables

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...  # outbound alerts
DISCORD_PUBLIC_KEY=abc123...                               # Ed25519 public key (signature verification)
DISCORD_BOT_TOKEN=Bot ...                                  # for slash command registration
DISCORD_GUILD_ID=123456789                                 # your server ID
DISCORD_CHANNEL_ID=987654321                               # default alert channel
```

### Usage

```
/revagent query: What is our MRR this month?
/revagent query: Show churn anomalies in the last 7 days
/revagent query: Forecast revenue for the next 90 days
/revagent query: What are the top churn reduction strategies?
```

### Response Flow

```
User types /revagent query:<text>
    ↓
POST /api/discord/interactions  (Discord sends JSON body)
    ↓
Ed25519 signature verified using DISCORD_PUBLIC_KEY (via PyNaCl)
    ↓
Immediate response: type=5 (DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE)
  → Discord shows "Bot is thinking..." spinner
    ↓
asyncio.create_task() → runs LangGraph in background
    ↓
Full agent pipeline: Supervisor → agents → Validator
    ↓
Result formatted as plain text (data, anomalies, forecast, recommendations)
    ↓
POST https://discord.com/api/v10/webhooks/{app_id}/{token}
  → Discord replaces spinner with the full response
```

### Response Format

Discord messages are capped at **2000 characters**. The formatter truncates each section accordingly:

```
**Query:** What is our MRR this month?

**📊 Data:**
```
| Month | MRR      |
|-------|----------|
| Feb   | $124,800 |
```

**⚠️ Anomalies (1 detected):**
• **MRR** (HIGH): MRR declined 12% vs last month...

**📈 Forecast:**
MRR projected to recover to $130k by end of Q2...

**💡 Recommendations:**
1. **Reactivation Campaign** — Estimated +$8k MRR
```

---

## Security

- All inbound Discord requests are verified using **Ed25519 cryptographic signatures**
- Discord will reject your endpoint if it fails signature verification
- Requires the `PyNaCl` library (`pip install PyNaCl`)
- The `DISCORD_PUBLIC_KEY` is the app's public key from the Developer Portal — not secret

---

## Multi-Tenant Mapping

Discord guilds (servers) are mapped to `company_id` via `_get_company_id_for_guild(guild_id)` in `discord.py`. Falls back to the demo tenant. In production, add a `discord_guilds` table:

```sql
CREATE TABLE discord_guilds (
    guild_id TEXT PRIMARY KEY,
    company_id UUID REFERENCES companies(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Limitations

- Discord does not support interactive approval buttons in the same way Slack does. Approvals must be done via the RevAgent web UI or Slack.
- The 2000-character message limit means long forecasts or large result sets are truncated.
- Follow-up webhooks expire after **15 minutes** — very long agent runs may not be deliverable.
