"""Pull data from Stripe API and upsert into PostgreSQL."""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

import stripe
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from config import settings
from data.database import get_session
from data.models import Company, Customer, Subscription, Invoice, SubscriptionEvent, MetricsDaily

logger = logging.getLogger(__name__)


def init_stripe(api_key: Optional[str] = None):
    stripe.api_key = api_key or settings.stripe_secret_key


async def _upsert_customer(company_id: str, customer) -> str:
    """Upsert one Stripe customer and return local customer id."""
    async with get_session() as session:
        stmt = pg_insert(Customer).values(
            company_id=company_id,
            stripe_customer_id=customer.id,
            email=customer.email or "",
            name=customer.name or "",
            segment=_infer_segment(customer),
            created_at=datetime.fromtimestamp(customer.created, tz=timezone.utc),
        ).on_conflict_do_update(
            index_elements=["stripe_customer_id"],
            set_={
                "email": customer.email or "",
                "name": customer.name or "",
                "segment": _infer_segment(customer),
            }
        )
        await session.execute(stmt)

    async with get_session() as session:
        result = await session.execute(
            select(Customer.id).where(Customer.stripe_customer_id == customer.id)
        )
        customer_id = result.scalar_one_or_none()
        if not customer_id:
            raise RuntimeError(f"Failed to resolve customer id for {customer.id}")
        return customer_id


# ── Customers ─────────────────────────────────────────────────────────────────

async def sync_customers(company_id: str, api_key: Optional[str] = None):
    init_stripe(api_key)
    synced = 0

    for customer in stripe.Customer.list(limit=100).auto_paging_iter():
        await _upsert_customer(company_id, customer)
        synced += 1

    logger.info(f"Synced {synced} customers for company {company_id}")
    return synced


def _infer_segment(customer: stripe.Customer) -> str:
    metadata = customer.metadata or {}
    if metadata.get("segment"):
        return metadata["segment"]
    # Heuristic: infer from plan/MRR when available
    return "SMB"


# ── Subscriptions ─────────────────────────────────────────────────────────────

async def sync_subscriptions(company_id: str, api_key: Optional[str] = None):
    init_stripe(api_key)
    synced = 0

    for sub in stripe.Subscription.list(
        limit=100,
        status="all",
        # Stripe limits nested expansion depth; expanding price.product can exceed
        # allowed depth on newer API versions.
        expand=["data.customer", "data.items.data.price"]
    ).auto_paging_iter():

        ok = await _upsert_subscription(company_id, sub)
        if not ok:
            continue
        synced += 1

    logger.info(f"Synced {synced} subscriptions for company {company_id}")
    return synced


def _extract_plan_tier(sub: stripe.Subscription) -> str:
    try:
        items = _subscription_items(sub)
        if not items:
            return "Starter"

        price = _get_attr(items[0], "price")
        product = _get_attr(price, "product")
        name = _get_attr(product, "name") if not isinstance(product, str) else ""
        name = (name or "").lower()

        # Fallback to nickname/lookup key when product isn't expanded to object
        if not name:
            nickname = (_get_attr(price, "nickname") or "").lower()
            lookup_key = (_get_attr(price, "lookup_key") or "").lower()
            name = f"{nickname} {lookup_key}".strip()
        if "enterprise" in name:
            return "Enterprise"
        elif "growth" in name or "pro" in name:
            return "Growth"
        else:
            return "Starter"
    except Exception:
        return "Starter"


def _calculate_mrr(sub: stripe.Subscription) -> float:
    """Convert Stripe subscription items to monthly recurring revenue in dollars."""
    mrr = 0.0
    try:
        for item in _subscription_items(sub):
            price = _get_attr(item, "price")
            amount = _get_attr(price, "unit_amount") or 0  # cents
            qty = _get_attr(item, "quantity") or 1
            recurring = _get_attr(price, "recurring")
            if recurring:
                interval = _get_attr(recurring, "interval")
                interval_count = _get_attr(recurring, "interval_count") or 1
                if interval == "month":
                    mrr += (amount * qty) / (interval_count * 100)
                elif interval == "year":
                    mrr += (amount * qty) / (interval_count * 12 * 100)
                elif interval == "week":
                    mrr += (amount * qty * 4.33) / (interval_count * 100)
    except Exception as e:
        logger.warning(f"MRR calculation failed: {e}")
    return round(mrr, 2)


def _get_attr(obj, key: str):
    """Access StripeObject attributes safely across SDK shapes."""
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def _subscription_items(sub: stripe.Subscription) -> list:
    items_obj = _get_attr(sub, "items")
    data = _get_attr(items_obj, "data")
    if isinstance(data, list):
        return data
    if isinstance(items_obj, dict):
        return items_obj.get("data", []) or []
    return []


async def _upsert_subscription(company_id: str, sub) -> bool:
    """Upsert one Stripe subscription. Returns False if customer linkage is missing."""
    customer_obj = _get_attr(sub, "customer")
    customer_stripe_id = _get_attr(customer_obj, "id") or (
        customer_obj if isinstance(customer_obj, str) else None
    )
    if not customer_stripe_id:
        logger.warning(f"Subscription {_get_attr(sub, 'id')} missing customer id")
        return False

    # Ensure customer exists locally first.
    customer = None
    async with get_session() as session:
        customer_result = await session.execute(
            select(Customer).where(Customer.stripe_customer_id == customer_stripe_id)
        )
        customer = customer_result.scalar_one_or_none()

    if not customer:
        try:
            remote_customer = stripe.Customer.retrieve(customer_stripe_id)
            await _upsert_customer(company_id, remote_customer)
        except Exception as e:
            logger.warning(f"Customer {customer_stripe_id} fetch failed for subscription {sub.id}: {e}")
            return False

        async with get_session() as session:
            customer_result = await session.execute(
                select(Customer).where(Customer.stripe_customer_id == customer_stripe_id)
            )
            customer = customer_result.scalar_one_or_none()
            if not customer:
                logger.warning(
                    f"Customer {customer_stripe_id} not found, skipping subscription {_get_attr(sub, 'id')}"
                )
                return False

    plan_tier = _extract_plan_tier(sub)
    mrr = _calculate_mrr(sub)

    existing_sub = None
    async with get_session() as session:
        existing_result = await session.execute(
            select(Subscription).where(Subscription.stripe_subscription_id == sub.id)
        )
        existing_sub = existing_result.scalar_one_or_none()

    async with get_session() as session:
        stmt = pg_insert(Subscription).values(
            company_id=company_id,
            customer_id=customer.id,
            stripe_subscription_id=sub.id,
            plan_tier=plan_tier,
            status=sub.status,
            mrr_amount=mrr,
            started_at=datetime.fromtimestamp(sub.start_date, tz=timezone.utc) if sub.start_date else None,
            canceled_at=datetime.fromtimestamp(sub.canceled_at, tz=timezone.utc) if sub.canceled_at else None,
            trial_end=datetime.fromtimestamp(sub.trial_end, tz=timezone.utc) if sub.trial_end else None,
            extra=dict(sub.metadata) if sub.metadata else {},
        ).on_conflict_do_update(
            index_elements=["stripe_subscription_id"],
            set_={
                "status": sub.status,
                "mrr_amount": mrr,
                "plan_tier": plan_tier,
                "canceled_at": datetime.fromtimestamp(sub.canceled_at, tz=timezone.utc) if sub.canceled_at else None,
                "metadata": dict(sub.metadata) if sub.metadata else {},
            }
        )
        await session.execute(stmt)

    async with get_session() as session:
        current_result = await session.execute(
            select(Subscription).where(Subscription.stripe_subscription_id == sub.id)
        )
        current_sub = current_result.scalar_one_or_none()

    if current_sub:
        event_payload = _derive_subscription_event(existing_sub, current_sub)
        if event_payload:
            async with get_session() as session:
                await session.execute(
                    pg_insert(SubscriptionEvent).values(
                        company_id=company_id,
                        subscription_id=current_sub.id,
                        event_type=event_payload["event_type"],
                        old_mrr=event_payload["old_mrr"],
                        new_mrr=event_payload["new_mrr"],
                        mrr_delta=event_payload["mrr_delta"],
                        timestamp=datetime.now(timezone.utc),
                        metadata={
                            "source": "stripe_sync",
                            "stripe_subscription_id": sub.id,
                            "status_from": event_payload["status_from"],
                            "status_to": event_payload["status_to"],
                        },
                    )
                )

    return True


def _derive_subscription_event(existing_sub, current_sub) -> Optional[dict]:
    """Translate subscription state transition into a normalized event payload."""
    new_status = current_sub.status or ""
    new_mrr = float(current_sub.mrr_amount or 0)

    if existing_sub is None:
        return {
            "event_type": "new",
            "old_mrr": 0.0,
            "new_mrr": new_mrr,
            "mrr_delta": round(new_mrr, 2),
            "status_from": None,
            "status_to": new_status,
        }

    old_status = existing_sub.status or ""
    old_mrr = float(existing_sub.mrr_amount or 0)

    # No meaningful change, skip emitting an event.
    if old_status == new_status and abs(new_mrr - old_mrr) < 0.01:
        return None

    if new_status == "canceled" and old_status != "canceled":
        return {
            "event_type": "churn",
            "old_mrr": old_mrr,
            "new_mrr": 0.0,
            "mrr_delta": round(-old_mrr, 2),
            "status_from": old_status,
            "status_to": new_status,
        }

    if old_status == "canceled" and new_status in {"active", "trialing", "past_due"}:
        return {
            "event_type": "reactivation",
            "old_mrr": old_mrr,
            "new_mrr": new_mrr,
            "mrr_delta": round(new_mrr - old_mrr, 2),
            "status_from": old_status,
            "status_to": new_status,
        }

    delta = round(new_mrr - old_mrr, 2)
    if delta > 0:
        return {
            "event_type": "upgrade",
            "old_mrr": old_mrr,
            "new_mrr": new_mrr,
            "mrr_delta": delta,
            "status_from": old_status,
            "status_to": new_status,
        }
    if delta < 0:
        return {
            "event_type": "downgrade",
            "old_mrr": old_mrr,
            "new_mrr": new_mrr,
            "mrr_delta": delta,
            "status_from": old_status,
            "status_to": new_status,
        }

    # Status-only transitions with flat MRR (e.g., trialing -> active) are treated as informational.
    return None


# ── Invoices ──────────────────────────────────────────────────────────────────

async def sync_invoices(company_id: str, api_key: Optional[str] = None):
    init_stripe(api_key)
    synced = 0

    for invoice in stripe.Invoice.list(limit=100).auto_paging_iter():
        ok = await _upsert_invoice(company_id, invoice)
        if ok:
            synced += 1

    logger.info(f"Synced {synced} invoices for company {company_id}")
    return synced


async def _upsert_invoice(company_id: str, invoice) -> bool:
    subscription_id = _get_attr(invoice, "subscription")
    customer_id = _get_attr(invoice, "customer")

    # Ensure subscription exists locally when available. If not resolvable,
    # still persist invoice with NULL subscription_id.
    sub = None
    if subscription_id:
        async with get_session() as session:
            sub_result = await session.execute(
                select(Subscription).where(Subscription.stripe_subscription_id == subscription_id)
            )
            sub = sub_result.scalar_one_or_none()

        if not sub:
            try:
                remote_sub = stripe.Subscription.retrieve(
                    subscription_id,
                    expand=["customer", "items.data.price"],
                )
                ok = await _upsert_subscription(company_id, remote_sub)
                if ok:
                    async with get_session() as session:
                        sub_result = await session.execute(
                            select(Subscription).where(Subscription.stripe_subscription_id == subscription_id)
                        )
                        sub = sub_result.scalar_one_or_none()
            except Exception as e:
                logger.warning(f"Subscription fetch failed for invoice {_get_attr(invoice, 'id')}: {e}")

    status_transitions = _get_attr(invoice, "status_transitions")
    paid_at_ts = _get_attr(status_transitions, "paid_at")
    period_start_ts = _get_attr(invoice, "period_start")
    period_end_ts = _get_attr(invoice, "period_end")

    async with get_session() as session:
        stmt = pg_insert(Invoice).values(
            company_id=company_id,
            subscription_id=sub.id if sub else None,
            stripe_customer_id=customer_id,
            stripe_invoice_id=invoice.id,
            amount=(_get_attr(invoice, "amount_paid") or 0) / 100,
            status=_get_attr(invoice, "status") or "unknown",
            paid_at=datetime.fromtimestamp(paid_at_ts, tz=timezone.utc) if paid_at_ts else None,
            period_start=datetime.fromtimestamp(period_start_ts, tz=timezone.utc) if period_start_ts else None,
            period_end=datetime.fromtimestamp(period_end_ts, tz=timezone.utc) if period_end_ts else None,
        ).on_conflict_do_update(
            index_elements=["stripe_invoice_id"],
            set_={
                "status": _get_attr(invoice, "status") or "unknown",
                "subscription_id": sub.id if sub else None,
                "stripe_customer_id": customer_id,
            }
        )
        await session.execute(stmt)
    return True


async def sync_customer_by_id(company_id: str, customer_id: str, api_key: Optional[str] = None) -> bool:
    """Selective sync for one Stripe customer id."""
    init_stripe(api_key)
    if not customer_id:
        return False
    customer = stripe.Customer.retrieve(customer_id)
    await _upsert_customer(company_id, customer)
    logger.info(f"Synced customer {customer_id} for company {company_id}")
    return True


async def sync_subscription_by_id(company_id: str, subscription_id: str, api_key: Optional[str] = None) -> bool:
    """Selective sync for one Stripe subscription id."""
    init_stripe(api_key)
    if not subscription_id:
        return False
    sub = stripe.Subscription.retrieve(
        subscription_id,
        expand=["customer", "items.data.price"],
    )
    ok = await _upsert_subscription(company_id, sub)
    if ok:
        logger.info(f"Synced subscription {subscription_id} for company {company_id}")
    return ok


async def sync_invoice_by_id(company_id: str, invoice_id: str, api_key: Optional[str] = None) -> bool:
    """Selective sync for one Stripe invoice id."""
    init_stripe(api_key)
    if not invoice_id:
        return False
    invoice = stripe.Invoice.retrieve(invoice_id)
    ok = await _upsert_invoice(company_id, invoice)
    if ok:
        logger.info(f"Synced invoice {invoice_id} for company {company_id}")
    return ok


# ── Metrics recomputation ─────────────────────────────────────────────────────

async def recompute_metrics(company_id: str):
    """Recompute metrics_daily for a company after Stripe sync."""
    async with get_session() as session:
        await session.execute(
            text("""
            WITH movement AS (
                SELECT
                    COALESCE(SUM(CASE
                        WHEN event_type = 'new' THEN GREATEST(mrr_delta, 0)
                        ELSE 0
                    END), 0) AS new_mrr,
                    COALESCE(SUM(CASE
                        WHEN event_type IN ('upgrade', 'reactivation') AND mrr_delta > 0 THEN mrr_delta
                        ELSE 0
                    END), 0) AS expansion_mrr,
                    COALESCE(SUM(CASE
                        WHEN event_type = 'downgrade' AND mrr_delta < 0 THEN ABS(mrr_delta)
                        ELSE 0
                    END), 0) AS contraction_mrr,
                    COALESCE(SUM(CASE
                        WHEN event_type = 'churn' THEN ABS(COALESCE(old_mrr, 0))
                        ELSE 0
                    END), 0) AS churn_mrr,
                    COALESCE(SUM(mrr_delta), 0) AS net_new_mrr
                FROM subscription_events se
                WHERE se.company_id = :company_id
                  AND se.timestamp >= DATE_TRUNC('day', NOW())
            ),
            base AS (
                SELECT
                    COALESCE(SUM(s.mrr_amount) FILTER (WHERE s.status = 'active'), 0) AS mrr,
                    COALESCE(SUM(s.mrr_amount) FILTER (WHERE s.status = 'active') * 12, 0) AS arr,
                    COUNT(*) FILTER (WHERE s.status = 'active') AS active_subscribers,
                    COUNT(*) FILTER (WHERE s.status = 'canceled'
                        AND s.canceled_at >= DATE_TRUNC('day', NOW())) AS churned_count,
                    COUNT(*) FILTER (WHERE s.status = 'active'
                        AND s.started_at >= DATE_TRUNC('day', NOW())) AS new_subscribers,
                    CASE WHEN COUNT(*) FILTER (WHERE s.status = 'active') > 0
                        THEN SUM(s.mrr_amount) FILTER (WHERE s.status = 'active')
                             / COUNT(*) FILTER (WHERE s.status = 'active')
                        ELSE 0 END AS arpu
                FROM subscriptions s
                WHERE s.company_id = :company_id
            )
            INSERT INTO metrics_daily (
                id, company_id, date, mrr, arr, active_subscribers,
                churned_count, new_subscribers, expansion_mrr, contraction_mrr,
                new_mrr, churn_mrr, net_new_mrr, arpu
            )
            SELECT
                gen_random_uuid(),
                :company_id,
                DATE_TRUNC('day', NOW()),
                base.mrr,
                base.arr,
                base.active_subscribers,
                base.churned_count,
                base.new_subscribers,
                movement.expansion_mrr AS expansion_mrr,
                movement.contraction_mrr AS contraction_mrr,
                movement.new_mrr AS new_mrr,
                movement.churn_mrr AS churn_mrr,
                movement.net_new_mrr AS net_new_mrr,
                base.arpu
            FROM base
            CROSS JOIN movement
            ON CONFLICT (company_id, date)
            DO UPDATE SET
                mrr = EXCLUDED.mrr,
                arr = EXCLUDED.arr,
                active_subscribers = EXCLUDED.active_subscribers,
                churned_count = EXCLUDED.churned_count,
                new_subscribers = EXCLUDED.new_subscribers,
                expansion_mrr = EXCLUDED.expansion_mrr,
                contraction_mrr = EXCLUDED.contraction_mrr,
                new_mrr = EXCLUDED.new_mrr,
                churn_mrr = EXCLUDED.churn_mrr,
                net_new_mrr = EXCLUDED.net_new_mrr,
                arpu = EXCLUDED.arpu
            """),
            {"company_id": company_id}
        )


# ── Full sync ─────────────────────────────────────────────────────────────────

async def full_sync(company_id: str, api_key: Optional[str] = None):
    """Run a complete Stripe → DB sync for a company."""
    logger.info(f"Starting full Stripe sync for company {company_id}")
    await sync_customers(company_id, api_key)
    await sync_subscriptions(company_id, api_key)
    await sync_invoices(company_id, api_key)
    await recompute_metrics(company_id)
    logger.info(f"Full sync complete for company {company_id}")


if __name__ == "__main__":
    import sys

    async def main():
        company_id = sys.argv[1] if len(sys.argv) > 1 else "00000000-0000-0000-0000-000000000001"
        await full_sync(company_id)

    asyncio.run(main())
