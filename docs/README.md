# RevAgent — Reference Documentation

**Author:** Payal Nagaonkar
**Repository:** github.com/Payal2000/revagent

This folder contains reference documentation for all RevAgent integrations and subsystems.

---

## Documents

| Doc | Description |
|-----|-------------|
| [slack-integration.md](slack-integration.md) | Outbound alerts, `/revagent` slash command, interactive approval buttons |
| [discord-integration.md](discord-integration.md) | Outbound webhook alerts, `/revagent` application command, Ed25519 verification |
| [email-langgraph.md](email-langgraph.md) | SendGrid `@tool` for LLM-triggered emails, Celery briefings, HTML formatting |

For the full system blueprint see [RevAgent_Complete_Blueprint.md](../RevAgent_Complete_Blueprint.md) at the project root.

---

## Notification Channel Summary

| Channel | Outbound | Inbound (slash cmd) | Approval buttons |
|---------|----------|---------------------|-----------------|
| **Slack** | ✅ Anomaly alerts + daily briefing | ✅ `/revagent` | ✅ Approve/Reject in Slack |
| **Discord** | ✅ Anomaly alerts + daily briefing | ✅ `/revagent` | ❌ (use web UI or Slack) |
| **Email** | ✅ Anomaly alerts + daily briefing | ❌ | ❌ |

---

## New Environment Variables

Add these to your `.env` alongside the existing variables:

```bash
# Slack (new — slash commands)
SLACK_SIGNING_SECRET=...         # from Slack App credentials

# Discord
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_PUBLIC_KEY=...           # Ed25519 public key from Discord Developer Portal
DISCORD_BOT_TOKEN=Bot ...        # for slash command registration only
DISCORD_GUILD_ID=...             # your Discord server ID
DISCORD_CHANNEL_ID=...           # default alert channel

# Email (new fields)
SENDGRID_FROM_EMAIL=noreply@revagent.io   # must be verified in SendGrid
# SENDGRID_API_KEY and ALERT_EMAIL already existed
```

---

## New API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/slack/events` | Slack slash commands (`/revagent`) |
| `POST` | `/api/slack/interactions` | Slack button callbacks (approve/reject) |
| `POST` | `/api/discord/interactions` | Discord slash commands + ping verification |

---

## New Source Files

```
backend/
  tools/
    slack_tools.py        # (existing) outbound Slack
    discord_tools.py      # NEW — outbound Discord webhook
    email_tools.py        # NEW — SendGrid @tool + briefing/alert senders
  api/routes/
    slack.py              # NEW — inbound Slack events + interactions
    discord.py            # NEW — inbound Discord interactions
  tasks/
    scheduled.py          # UPDATED — daily briefing now fans out to all 3 channels
  config.py               # UPDATED — Discord + SENDGRID_FROM_EMAIL settings
```
