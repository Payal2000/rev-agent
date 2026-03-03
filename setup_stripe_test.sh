#!/bin/bash
# RevAgent — Stripe Test Mode Setup
# Run this once to seed test data and configure webhooks.

set -e

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║       RevAgent — Stripe Test Mode Setup          ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Check Stripe CLI login ────────────────────────────────────────────
echo "Step 1: Checking Stripe CLI..."
if ! stripe whoami &>/dev/null; then
  echo "  → Not logged in. Opening Stripe login..."
  stripe login
else
  ACCOUNT=$(stripe whoami 2>/dev/null | head -1)
  echo "  ✓ Logged in: $ACCOUNT"
fi

# ── Step 2: Get webhook secret ────────────────────────────────────────────────
echo ""
echo "Step 2: Getting webhook secret for local forwarding..."
WEBHOOK_SECRET=$(stripe listen --print-secret 2>/dev/null)
if [ -z "$WEBHOOK_SECRET" ]; then
  echo "  ✗ Could not get webhook secret. Make sure Stripe CLI is logged in."
  exit 1
fi
echo "  ✓ Webhook secret: ${WEBHOOK_SECRET:0:12}..."

# ── Step 3: Update .env ───────────────────────────────────────────────────────
echo ""
echo "Step 3: Updating .env with webhook secret..."
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "  ✓ Created .env from .env.example"
fi

# Update or append STRIPE_WEBHOOK_SECRET
if grep -q "^STRIPE_WEBHOOK_SECRET=" .env; then
  sed -i.bak "s|^STRIPE_WEBHOOK_SECRET=.*|STRIPE_WEBHOOK_SECRET=${WEBHOOK_SECRET}|" .env
else
  echo "STRIPE_WEBHOOK_SECRET=${WEBHOOK_SECRET}" >> .env
fi
echo "  ✓ STRIPE_WEBHOOK_SECRET written to .env"

# ── Step 4: Check STRIPE_SECRET_KEY ──────────────────────────────────────────
echo ""
echo "Step 4: Checking STRIPE_SECRET_KEY..."
STRIPE_KEY=$(grep "^STRIPE_SECRET_KEY=" .env 2>/dev/null | cut -d'=' -f2)
if [ -z "$STRIPE_KEY" ] || [ "$STRIPE_KEY" = "sk_live_..." ] || [ "$STRIPE_KEY" = "sk_test_..." ]; then
  echo ""
  echo "  ⚠️  STRIPE_SECRET_KEY not set in .env"
  echo "  Get your test key from: https://dashboard.stripe.com/test/apikeys"
  echo ""
  read -p "  Paste your sk_test_... key here: " USER_KEY
  if [[ "$USER_KEY" != sk_test_* ]]; then
    echo "  ✗ Key must start with sk_test_"
    exit 1
  fi
  sed -i.bak "s|^STRIPE_SECRET_KEY=.*|STRIPE_SECRET_KEY=${USER_KEY}|" .env
  echo "  ✓ STRIPE_SECRET_KEY saved to .env"
else
  echo "  ✓ STRIPE_SECRET_KEY already set: ${STRIPE_KEY:0:12}..."
fi

# ── Step 5: Seed test data ────────────────────────────────────────────────────
echo ""
echo "Step 5: Seeding test data in Stripe (30 customers + subscriptions)..."
echo "  (Includes simulated Enterprise churn spike for anomaly detection demo)"
echo ""
cd backend
python -m data.stripe_seed_test
cd ..

# ── Step 6: Instructions ──────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║              Setup Complete!                      ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Now run these in separate terminals:"
echo ""
echo "  Terminal 1 — Webhook forwarding (keep running):"
echo "    stripe listen --forward-to localhost:8000/api/webhook/stripe"
echo ""
echo "  Terminal 2 — Backend:"
echo "    cd backend"
echo "    python -m data.database          # init tables"
echo "    python -m data.stripe_sync 00000000-0000-0000-0000-000000000001"
echo "    python -m data.schema_embeddings # embed schema into pgvector"
echo "    uvicorn api.main:app --reload"
echo ""
echo "  Terminal 3 — Frontend:"
echo "    cd frontend && npm run dev"
echo ""
echo "  Test a webhook event:"
echo "    stripe trigger customer.subscription.deleted"
echo ""
