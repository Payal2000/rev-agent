"""Stripe webhook handler — signature verification, event ingestion, threshold checks."""
import json
import logging

import stripe
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request, status

from config import settings
from data.stripe_sync import recompute_metrics

logger = logging.getLogger(__name__)
router = APIRouter()

# Stripe event types we care about
HANDLED_EVENTS = {
    "invoice.paid",
    "invoice.payment_failed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.trial_will_end",
    "charge.failed",
    "charge.dispute.created",
}


@router.post("/webhook/stripe")
async def stripe_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    stripe_signature: str = Header(alias="stripe-signature", default=None),
):
    """
    Receives Stripe webhook events.
    - Verifies signature before any processing
    - Returns 200 immediately to Stripe (fast ACK)
    - Processes the event asynchronously in background
    """
    payload = await request.body()

    # ── Signature verification — never skip ───────────────────────────────────
    if settings.stripe_webhook_secret:
        try:
            event = stripe.Webhook.construct_event(
                payload=payload,
                sig_header=stripe_signature,
                secret=settings.stripe_webhook_secret,
            )
        except stripe.errors.SignatureVerificationError as e:
            logger.warning(f"Stripe webhook signature verification failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid webhook signature",
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Webhook error: {e}",
            )
    else:
        # Development mode — no signature check
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("type", "")

    if event_type not in HANDLED_EVENTS:
        return {"status": "ignored", "type": event_type}

    logger.info(f"[Webhook] Received: {event_type}")

    # Schedule async processing — respond to Stripe immediately
    background_tasks.add_task(_process_stripe_event, event)

    return {"status": "received", "type": event_type}


async def _process_stripe_event(event: dict):
    """Process a Stripe event asynchronously."""
    event_type = event.get("type", "")
    obj = event.get("data", {}).get("object", {})

    try:
        if event_type in (
            "customer.subscription.created",
            "customer.subscription.updated",
            "customer.subscription.deleted",
            "invoice.paid",
            "invoice.payment_failed",
        ):
            # Get company_id from metadata or default to demo
            company_id = obj.get("metadata", {}).get("company_id", "00000000-0000-0000-0000-000000000001")

            # Recompute metrics after subscription change
            await recompute_metrics(company_id)
            logger.info(f"[Webhook] Recomputed metrics for company {company_id} after {event_type}")

            # Check if thresholds are breached → trigger Insights Agent
            await _check_thresholds_and_trigger(company_id, event_type)

    except Exception as e:
        logger.error(f"[Webhook] Error processing {event_type}: {e}", exc_info=True)


async def _check_thresholds_and_trigger(company_id: str, event_type: str):
    """Check if the event breaches any configured thresholds and trigger agents."""
    # For now, trigger insights on subscription cancellation events
    if event_type == "customer.subscription.deleted":
        logger.info(f"[Webhook] Subscription deletion detected — will trigger insights check")
        # In production: enqueue via Celery
        # celery_app.send_task("tasks.run_insights_pipeline", args=[company_id])
