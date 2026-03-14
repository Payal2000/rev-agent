#!/usr/bin/env bash
# Continuously generate Stripe test-mode synthetic events and sync to DB.
#
# Usage:
#   scripts/stripe_cli_synth_loop.sh [events_per_cycle] [interval_seconds] [company_id]
# Example:
#   scripts/stripe_cli_synth_loop.sh 200 600 00000000-0000-0000-0000-000000000001

set -euo pipefail

EVENTS_PER_CYCLE="${1:-200}"
INTERVAL_SECONDS="${2:-600}"
COMPANY_ID="${3:-00000000-0000-0000-0000-000000000001}"

if [ ! -x "./scripts/stripe_cli_synth.sh" ]; then
  echo "Missing executable ./scripts/stripe_cli_synth.sh"
  echo "Run: chmod +x scripts/stripe_cli_synth.sh"
  exit 1
fi

if ! [[ "$EVENTS_PER_CYCLE" =~ ^[0-9]+$ ]] || ! [[ "$INTERVAL_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "events_per_cycle and interval_seconds must be integers."
  exit 1
fi

if [ "$EVENTS_PER_CYCLE" -le 0 ] || [ "$INTERVAL_SECONDS" -le 0 ]; then
  echo "events_per_cycle and interval_seconds must be > 0."
  exit 1
fi

echo "Starting Stripe synthetic loop"
echo "  events_per_cycle : $EVENTS_PER_CYCLE"
echo "  interval_seconds : $INTERVAL_SECONDS"
echo "  company_id       : $COMPANY_ID"
echo "Press Ctrl+C to stop."
echo ""

cycle=0
while true; do
  cycle=$((cycle + 1))
  start_ts="$(date +%s)"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cycle #$cycle started"

  ./scripts/stripe_cli_synth.sh "$EVENTS_PER_CYCLE" "$COMPANY_ID"

  end_ts="$(date +%s)"
  elapsed=$((end_ts - start_ts))
  sleep_for=$((INTERVAL_SECONDS - elapsed))
  if [ "$sleep_for" -lt 0 ]; then
    sleep_for=0
  fi

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cycle #$cycle complete (elapsed ${elapsed}s). Next run in ${sleep_for}s."
  echo ""
  sleep "$sleep_for"
done
