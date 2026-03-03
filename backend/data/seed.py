"""Generate realistic synthetic SaaS data for demo/testing."""
import asyncio
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.dialects.postgresql import insert as pg_insert

from data.database import get_session
from data.models import (
    Company, Customer, Subscription, Invoice,
    SubscriptionEvent, MetricsDaily,
)

random.seed(42)

DEMO_COMPANY_ID = "00000000-0000-0000-0000-000000000001"

PLAN_TIERS = {
    "Starter":    {"mrr": 49,   "weight": 0.5},
    "Growth":     {"mrr": 199,  "weight": 0.35},
    "Enterprise": {"mrr": 999,  "weight": 0.15},
}

CANCEL_REASONS = ["pricing", "competitor", "reduced_usage", "feature_gap", "budget_cut"]
SEGMENTS = {"Starter": "SMB", "Growth": "Mid-Market", "Enterprise": "Enterprise"}

FIRST_NAMES = ["Alex", "Jordan", "Morgan", "Taylor", "Casey", "Riley", "Drew", "Avery", "Quinn", "Blake"]
LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Martinez", "Davis", "Wilson", "Anderson"]
DOMAINS = ["acme.com", "techcorp.io", "saasify.co", "cloudworks.net", "devhub.app"]


def _random_email(first: str, last: str) -> str:
    domain = random.choice(DOMAINS)
    return f"{first.lower()}.{last.lower()}@{domain}"


def _random_date(days_back_start: int, days_back_end: int = 0) -> datetime:
    days_back = random.randint(days_back_end, days_back_start)
    return datetime.now(tz=timezone.utc) - timedelta(days=days_back)


async def seed_demo_data(
    company_name: str = "Acme SaaS Inc.",
    num_customers: int = 150,
    churn_rate: float = 0.08,  # 8% monthly churn
):
    print(f"Seeding demo data: {num_customers} customers, {churn_rate*100:.0f}% churn rate")

    async with get_session() as session:
        # Company
        stmt = pg_insert(Company).values(
            id=DEMO_COMPANY_ID,
            name=company_name,
            stripe_account_id=None,
        ).on_conflict_do_nothing()
        await session.execute(stmt)

    customers = []
    subscriptions = []
    events = []

    for i in range(num_customers):
        first = random.choice(FIRST_NAMES)
        last = random.choice(LAST_NAMES)
        customer_id = str(uuid.uuid4())

        # Pick plan tier
        tier = random.choices(
            list(PLAN_TIERS.keys()),
            weights=[v["weight"] for v in PLAN_TIERS.values()],
            k=1
        )[0]
        mrr = PLAN_TIERS[tier]["mrr"] * random.uniform(0.9, 1.1)
        started_at = _random_date(365, 30)

        # Determine if churned
        is_churned = random.random() < churn_rate
        # Introduce a "churn spike" in the last 30 days for Enterprise (for demo anomaly detection)
        if tier == "Enterprise" and random.random() < 0.35:
            is_churned = True

        canceled_at = None
        cancel_reason = None
        if is_churned:
            canceled_at = _random_date(30, 1)
            cancel_reason = random.choices(
                CANCEL_REASONS,
                weights=[0.4, 0.25, 0.2, 0.1, 0.05],
                k=1
            )[0]

        customers.append({
            "id": customer_id,
            "company_id": DEMO_COMPANY_ID,
            "stripe_customer_id": f"cus_seed_{i:04d}",
            "email": _random_email(first, last),
            "name": f"{first} {last}",
            "segment": SEGMENTS[tier],
            "created_at": started_at - timedelta(days=random.randint(1, 10)),
        })

        sub_id = str(uuid.uuid4())
        subscriptions.append({
            "id": sub_id,
            "customer_id": customer_id,
            "company_id": DEMO_COMPANY_ID,
            "stripe_subscription_id": f"sub_seed_{i:04d}",
            "plan_tier": tier,
            "status": "canceled" if is_churned else "active",
            "mrr_amount": round(mrr, 2),
            "started_at": started_at,
            "canceled_at": canceled_at,
            "cancel_reason": cancel_reason,
        })

        # Subscription created event
        events.append({
            "id": str(uuid.uuid4()),
            "subscription_id": sub_id,
            "company_id": DEMO_COMPANY_ID,
            "event_type": "new",
            "old_mrr": 0.0,
            "new_mrr": round(mrr, 2),
            "mrr_delta": round(mrr, 2),
            "timestamp": started_at,
        })

        # Occasionally add an upgrade event
        if not is_churned and random.random() < 0.15 and tier != "Enterprise":
            upgrade_mrr = mrr * random.uniform(1.5, 2.0)
            upgrade_at = started_at + timedelta(days=random.randint(30, 180))
            events.append({
                "id": str(uuid.uuid4()),
                "subscription_id": sub_id,
                "company_id": DEMO_COMPANY_ID,
                "event_type": "upgrade",
                "old_mrr": round(mrr, 2),
                "new_mrr": round(upgrade_mrr, 2),
                "mrr_delta": round(upgrade_mrr - mrr, 2),
                "timestamp": upgrade_at,
            })

        # Churn event
        if is_churned:
            events.append({
                "id": str(uuid.uuid4()),
                "subscription_id": sub_id,
                "company_id": DEMO_COMPANY_ID,
                "event_type": "churn",
                "old_mrr": round(mrr, 2),
                "new_mrr": 0.0,
                "mrr_delta": -round(mrr, 2),
                "timestamp": canceled_at,
            })

    # Bulk insert
    async with get_session() as session:
        for batch in _chunks(customers, 50):
            await session.execute(pg_insert(Customer).values(batch).on_conflict_do_nothing())
        print(f"  ✓ Inserted {len(customers)} customers")

        for batch in _chunks(subscriptions, 50):
            await session.execute(pg_insert(Subscription).values(batch).on_conflict_do_nothing())
        print(f"  ✓ Inserted {len(subscriptions)} subscriptions")

        for batch in _chunks(events, 50):
            await session.execute(pg_insert(SubscriptionEvent).values(batch).on_conflict_do_nothing())
        print(f"  ✓ Inserted {len(events)} subscription events")

    # Generate 90 days of metrics_daily
    await _seed_metrics_daily(subscriptions)
    print("Seed complete!")


async def _seed_metrics_daily(subscriptions: list[dict]):
    """Generate historical metrics_daily rows for the last 90 days."""
    metrics = []
    base_date = datetime.now(tz=timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    active_subs = [s for s in subscriptions if s["status"] == "active"]
    base_mrr = sum(s["mrr_amount"] for s in active_subs)

    for days_ago in range(90, -1, -1):
        date = base_date - timedelta(days=days_ago)
        # Simulate gradual MRR growth with noise
        growth_factor = 1 + (90 - days_ago) * 0.001
        daily_mrr = base_mrr * growth_factor * random.uniform(0.97, 1.03)
        active_count = len(active_subs)
        churned = random.randint(0, 3)
        new_subs = random.randint(1, 5)

        # Simulate churn spike in last 30 days
        if days_ago < 30:
            churned = random.randint(2, 6)

        metrics.append({
            "id": str(uuid.uuid4()),
            "company_id": DEMO_COMPANY_ID,
            "date": date,
            "mrr": round(daily_mrr, 2),
            "arr": round(daily_mrr * 12, 2),
            "active_subscribers": active_count,
            "churned_count": churned,
            "new_subscribers": new_subs,
            "expansion_mrr": round(random.uniform(200, 800), 2),
            "contraction_mrr": round(random.uniform(100, 400), 2),
            "new_mrr": round(new_subs * 150, 2),
            "churn_mrr": round(churned * 200, 2),
            "net_new_mrr": round(new_subs * 150 - churned * 200, 2),
            "arpu": round(daily_mrr / max(active_count, 1), 2),
        })

    async with get_session() as session:
        for batch in _chunks(metrics, 50):
            await session.execute(
                pg_insert(MetricsDaily).values(batch).on_conflict_do_update(
                    index_elements=["company_id", "date"],
                    set_={"mrr": pg_insert(MetricsDaily).excluded.mrr}
                )
            )
    print(f"  ✓ Generated {len(metrics)} days of metrics_daily")


def _chunks(lst: list, n: int):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


if __name__ == "__main__":
    asyncio.run(seed_demo_data())
