"""Stripe webhook handler — signature verification, event ingestion, threshold checks."""
import json
import logging
from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert

from config import settings
from data.database import get_session
from data.models import StripeWebhookEvent
from data.stripe_sync import (
    recompute_metrics,
    sync_customer_by_id,
    sync_invoice_by_id,
    sync_subscription_by_id,
)

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
    event_id = event.get("id")

    if event_type not in HANDLED_EVENTS:
        return {"status": "ignored", "type": event_type}

    logger.info(f"[Webhook] Received: {event_type}")

    # Stripe guarantees event.id uniqueness; use it for idempotency.
    if event_id:
        should_process = await _claim_event(event_id, event_type)
        if not should_process:
            logger.info(f"[Webhook] Duplicate ignored: {event_id} ({event_type})")
            return {"status": "duplicate", "type": event_type, "id": event_id}

    # Schedule async processing — respond to Stripe immediately
    background_tasks.add_task(_process_stripe_event, event)

    return {"status": "received", "type": event_type, "id": event_id}


async def _process_stripe_event(event: dict):
    """Process a Stripe event asynchronously."""
    event_id = event.get("id")
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

            # Selective Stripe sync so local DB stays fresh without a full sync.
            invoice_id = obj.get("id") if event_type.startswith("invoice.") else None
            subscription_id = obj.get("id") if event_type.startswith("customer.subscription.") else obj.get("subscription")
            customer_id = obj.get("customer")

            if customer_id:
                await sync_customer_by_id(company_id, customer_id)
            if subscription_id:
                await sync_subscription_by_id(company_id, subscription_id)
            if invoice_id:
                await sync_invoice_by_id(company_id, invoice_id)

            # Recompute metrics after subscription change
            await recompute_metrics(company_id)
            logger.info(f"[Webhook] Recomputed metrics for company {company_id} after {event_type}")

            # Check if thresholds are breached → trigger Insights Agent
            await _check_thresholds_and_trigger(company_id, event_type)

        if event_id:
            await _mark_event(event_id, status_value="processed")
    except Exception as e:
        if event_id:
            await _mark_event(event_id, status_value="failed", error=str(e))
        logger.error(f"[Webhook] Error processing {event_type}: {e}", exc_info=True)


async def _check_thresholds_and_trigger(company_id: str, event_type: str):
    """Check if the event breaches any configured thresholds and trigger agents."""
    # For now, trigger insights on subscription cancellation events
    if event_type == "customer.subscription.deleted":
        logger.info(f"[Webhook] Subscription deletion detected — will trigger insights check")
        # In production: enqueue via Celery
        # celery_app.send_task("tasks.run_insights_pipeline", args=[company_id])


async def _claim_event(event_id: str, event_type: str) -> bool:
    """
    Claim an event for processing.
    Returns True if this request should process the event; False for duplicates.
    """
    async with get_session() as session:
        stmt = (
            insert(StripeWebhookEvent)
            .values(
                stripe_event_id=event_id,
                event_type=event_type,
                status="processing",
            )
            .on_conflict_do_nothing(index_elements=["stripe_event_id"])
            .returning(StripeWebhookEvent.id)
        )
        inserted = (await session.execute(stmt)).scalar_one_or_none()
        if inserted:
            return True

        existing = await session.execute(
            select(StripeWebhookEvent.status).where(StripeWebhookEvent.stripe_event_id == event_id)
        )
        status_value = existing.scalar_one_or_none()

        # Allow explicit retries only for events previously marked failed.
        if status_value == "failed":
            await session.execute(
                update(StripeWebhookEvent)
                .where(StripeWebhookEvent.stripe_event_id == event_id)
                .values(status="processing", error=None, processed_at=None)
            )
            return True

    return False


async def _mark_event(event_id: str, status_value: str, error: str | None = None) -> None:
    async with get_session() as session:
        values = {
            "status": status_value,
            "error": error,
            "processed_at": datetime.now(timezone.utc),
        }
        await session.execute(
            update(StripeWebhookEvent)
            .where(StripeWebhookEvent.stripe_event_id == event_id)
            .values(**values)
        )
