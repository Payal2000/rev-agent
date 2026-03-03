"""Pull data from Stripe API and upsert into PostgreSQL."""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

import stripe
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from config import settings
from data.database import get_session
from data.models import Company, Customer, Subscription, Invoice, SubscriptionEvent, MetricsDaily

logger = logging.getLogger(__name__)


def init_stripe(api_key: Optional[str] = None):
    stripe.api_key = api_key or settings.stripe_secret_key


# ── Customers ─────────────────────────────────────────────────────────────────

async def sync_customers(company_id: str, api_key: Optional[str] = None):
    init_stripe(api_key)
    synced = 0

    for customer in stripe.Customer.list(limit=100).auto_paging_iter():
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
        expand=["data.customer", "data.items.data.price.product"]
    ).auto_paging_iter():

        async with get_session() as session:
            # Ensure customer exists
            customer_result = await session.execute(
                select(Customer).where(Customer.stripe_customer_id == sub.customer.id)
            )
            customer = customer_result.scalar_one_or_none()
            if not customer:
                logger.warning(f"Customer {sub.customer.id} not found, skipping subscription {sub.id}")
                continue

            plan_tier = _extract_plan_tier(sub)
            mrr = _calculate_mrr(sub)

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
                metadata=dict(sub.metadata) if sub.metadata else {},
            ).on_conflict_do_update(
                index_elements=["stripe_subscription_id"],
                set_={
                    "status": sub.status,
                    "mrr_amount": mrr,
                    "plan_tier": plan_tier,
                    "canceled_at": datetime.fromtimestamp(sub.canceled_at, tz=timezone.utc) if sub.canceled_at else None,
                }
            )
            await session.execute(stmt)
        synced += 1

    logger.info(f"Synced {synced} subscriptions for company {company_id}")
    return synced


def _extract_plan_tier(sub: stripe.Subscription) -> str:
    try:
        product = sub.items.data[0].price.product
        name = product.name.lower() if hasattr(product, "name") else ""
        if "enterprise" in name:
            return "Enterprise"
        elif "growth" in name or "pro" in name:
            return "Growth"
        else:
            return "Starter"
    except (IndexError, AttributeError):
        return "Starter"


def _calculate_mrr(sub: stripe.Subscription) -> float:
    """Convert Stripe subscription items to monthly recurring revenue in dollars."""
    mrr = 0.0
    try:
        for item in sub.items.data:
            price = item.price
            amount = price.unit_amount or 0  # cents
            qty = item.quantity or 1
            if price.recurring:
                interval = price.recurring.interval
                interval_count = price.recurring.interval_count or 1
                if interval == "month":
                    mrr += (amount * qty) / (interval_count * 100)
                elif interval == "year":
                    mrr += (amount * qty) / (interval_count * 12 * 100)
                elif interval == "week":
                    mrr += (amount * qty * 4.33) / (interval_count * 100)
    except Exception as e:
        logger.warning(f"MRR calculation failed: {e}")
    return round(mrr, 2)


# ── Invoices ──────────────────────────────────────────────────────────────────

async def sync_invoices(company_id: str, api_key: Optional[str] = None):
    init_stripe(api_key)
    synced = 0

    for invoice in stripe.Invoice.list(limit=100).auto_paging_iter():
        if not invoice.subscription:
            continue

        async with get_session() as session:
            sub_result = await session.execute(
                select(Subscription).where(
                    Subscription.stripe_subscription_id == invoice.subscription
                )
            )
            sub = sub_result.scalar_one_or_none()
            if not sub:
                continue

            stmt = pg_insert(Invoice).values(
                company_id=company_id,
                subscription_id=sub.id,
                stripe_invoice_id=invoice.id,
                amount=(invoice.amount_paid or 0) / 100,
                status=invoice.status or "unknown",
                paid_at=datetime.fromtimestamp(invoice.status_transitions.paid_at, tz=timezone.utc)
                       if invoice.status_transitions and invoice.status_transitions.paid_at else None,
                period_start=datetime.fromtimestamp(invoice.period_start, tz=timezone.utc),
                period_end=datetime.fromtimestamp(invoice.period_end, tz=timezone.utc),
            ).on_conflict_do_update(
                index_elements=["stripe_invoice_id"],
                set_={"status": invoice.status or "unknown"}
            )
            await session.execute(stmt)
        synced += 1

    logger.info(f"Synced {synced} invoices for company {company_id}")
    return synced


# ── Metrics recomputation ─────────────────────────────────────────────────────

async def recompute_metrics(company_id: str):
    """Recompute metrics_daily for a company after Stripe sync."""
    async with get_session() as session:
        await session.execute(
            """
            INSERT INTO metrics_daily (
                id, company_id, date, mrr, arr, active_subscribers,
                churned_count, new_subscribers, expansion_mrr, contraction_mrr,
                new_mrr, churn_mrr, net_new_mrr, arpu
            )
            SELECT
                gen_random_uuid(),
                :company_id,
                DATE_TRUNC('day', NOW()),
                COALESCE(SUM(s.mrr_amount) FILTER (WHERE s.status = 'active'), 0) AS mrr,
                COALESCE(SUM(s.mrr_amount) FILTER (WHERE s.status = 'active') * 12, 0) AS arr,
                COUNT(*) FILTER (WHERE s.status = 'active') AS active_subscribers,
                COUNT(*) FILTER (WHERE s.status = 'canceled'
                    AND s.canceled_at >= DATE_TRUNC('day', NOW())) AS churned_count,
                COUNT(*) FILTER (WHERE s.status = 'active'
                    AND s.started_at >= DATE_TRUNC('day', NOW())) AS new_subscribers,
                0 AS expansion_mrr,
                0 AS contraction_mrr,
                0 AS new_mrr,
                0 AS churn_mrr,
                0 AS net_new_mrr,
                CASE WHEN COUNT(*) FILTER (WHERE s.status = 'active') > 0
                    THEN SUM(s.mrr_amount) FILTER (WHERE s.status = 'active')
                         / COUNT(*) FILTER (WHERE s.status = 'active')
                    ELSE 0 END AS arpu
            FROM subscriptions s
            WHERE s.company_id = :company_id
            ON CONFLICT (company_id, date)
            DO UPDATE SET
                mrr = EXCLUDED.mrr,
                arr = EXCLUDED.arr,
                active_subscribers = EXCLUDED.active_subscribers,
                churned_count = EXCLUDED.churned_count,
                arpu = EXCLUDED.arpu
            """,
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
