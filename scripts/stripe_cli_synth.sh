#!/usr/bin/env bash
# Generate synthetic Stripe test-mode events via Stripe CLI and sync into RevAgent DB.
#
# Usage:
#   scripts/stripe_cli_synth.sh [cycles] [company_id]
# Example:
#   scripts/stripe_cli_synth.sh 25 00000000-0000-0000-0000-000000000001

set -euo pipefail

CYCLES="${1:-20}"
COMPANY_ID="${2:-00000000-0000-0000-0000-000000000001}"

if ! command -v stripe >/dev/null 2>&1; then
  echo "Stripe CLI not found. Install: https://docs.stripe.com/stripe-cli"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for DB sync in this project."
  exit 1
fi

# Prefer explicit API key from .env to avoid session/auth profile issues.
STRIPE_API_KEY="${STRIPE_SECRET_KEY:-}"
if [ -z "${STRIPE_API_KEY}" ] && [ -f ".env" ]; then
  STRIPE_API_KEY="$(grep -E '^STRIPE_SECRET_KEY=' .env | tail -1 | cut -d'=' -f2- | tr -d '"')"
fi

STRIPE_CMD=(stripe)
if [ -n "${STRIPE_API_KEY}" ]; then
  STRIPE_CMD=(stripe --api-key "${STRIPE_API_KEY}")
fi

if [ -z "${STRIPE_API_KEY}" ]; then
  if ! stripe whoami >/dev/null 2>&1; then
    echo "Stripe auth not detected."
    echo "Either run: stripe login"
    echo "Or set STRIPE_SECRET_KEY=sk_test_... in .env"
    exit 1
  fi
fi

echo "Generating ${CYCLES} synthetic Stripe events..."
echo "Company: ${COMPANY_ID}"
echo ""

EVENTS=(
  "customer.subscription.created"
  "customer.subscription.updated"
  "customer.subscription.deleted"
  "invoice.paid"
  "invoice.payment_failed"
)

for ((i=1; i<=CYCLES; i++)); do
  idx=$((RANDOM % ${#EVENTS[@]}))
  event="${EVENTS[$idx]}"
  echo "[$i/$CYCLES] stripe trigger ${event}"
  "${STRIPE_CMD[@]}" trigger "${event}" >/dev/null
done

echo ""
echo "Running Stripe -> Postgres sync..."
docker compose exec -T backend python -m data.stripe_sync "${COMPANY_ID}" >/dev/null

echo ""
echo "Latest table counts:"
docker compose exec -T backend python - <<'PY'
import asyncio
from sqlalchemy import text
from data.database import get_session

async def main():
    async with get_session() as s:
        for t in ["customers", "subscriptions", "invoices", "metrics_daily", "stripe_webhook_events"]:
            r = await s.execute(text(f"SELECT count(*) FROM {t}"))
            print(f"{t:22s} {r.scalar()}")

asyncio.run(main())
PY

echo ""
echo "Done."
echo "Tip: keep this running in another terminal for real-time webhook ingestion:"
echo "  stripe listen --events customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed --forward-to localhost:8000/api/webhook/stripe"
