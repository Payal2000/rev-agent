"""Seed schema_embeddings with accurate table/column descriptions for the Query Agent."""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from openai import AsyncOpenAI
from sqlalchemy import text
from config import settings
from data.database import get_session

client = AsyncOpenAI(api_key=settings.openai_api_key)

SCHEMA_DESCRIPTIONS = [
    {
        "table_name": "subscription_events",
        "description": (
            "Records individual subscription lifecycle events such as new subscriptions, cancellations, upgrades, and downgrades. "
            "Columns: id (uuid), subscription_id (uuid, FK to subscriptions), company_id (uuid, tenant), "
            "event_type (varchar: 'new', 'churn', 'upgrade', 'downgrade', 'reactivation'), "
            "old_mrr (float), new_mrr (float), mrr_delta (float, change in MRR), "
            "timestamp (timestamptz, when the event occurred), metadata (jsonb). "
            "NOTE: use 'timestamp' not 'created_at'. Use 'mrr_delta' for revenue change. "
            "For plan/tier info, JOIN with subscriptions on subscription_id and use subscriptions.plan_tier. "
            "Example churn query: SELECT COUNT(*), SUM(mrr_delta) FROM subscription_events "
            "WHERE company_id=:cid AND event_type='churn' AND timestamp >= date_trunc('month', now()-interval '1 month')."
        ),
    },
    {
        "table_name": "subscriptions",
        "description": (
            "Active and historical customer subscriptions. "
            "Columns: id (uuid), customer_id (uuid, FK to customers), company_id (uuid, tenant), "
            "stripe_subscription_id (varchar), plan_tier (varchar: 'Starter', 'Growth', 'Enterprise'), "
            "status (varchar: 'active', 'canceled', 'trialing', 'past_due'), "
            "mrr_amount (float, monthly recurring revenue for this subscription), "
            "started_at (timestamptz), canceled_at (timestamptz, null if still active), "
            "cancel_reason (varchar), trial_end (timestamptz), "
            "created_at (timestamptz), updated_at (timestamptz). "
            "Use plan_tier (not plan_type) to filter by tier. "
            "Example: SELECT plan_tier, COUNT(*), SUM(mrr_amount) FROM subscriptions WHERE company_id=:cid AND status='active' GROUP BY plan_tier."
        ),
    },
    {
        "table_name": "customers",
        "description": (
            "Customer accounts. "
            "Columns: id (uuid), company_id (uuid, tenant), stripe_customer_id (varchar), "
            "email (varchar), name (varchar), segment (varchar: 'smb', 'mid_market', 'enterprise'), "
            "created_at (timestamptz). "
            "JOIN with subscriptions on customers.id = subscriptions.customer_id to get subscription details."
        ),
    },
    {
        "table_name": "metrics_daily",
        "description": (
            "Pre-aggregated daily revenue metrics per tenant. Best table for MRR trends and KPI queries. "
            "Columns: id (uuid), company_id (uuid, tenant), date (timestamptz, the day), "
            "mrr (float, total MRR that day), arr (float, annualized), "
            "active_subscribers (int), churned_count (int), new_subscribers (int), "
            "expansion_mrr (float), contraction_mrr (float), new_mrr (float), churn_mrr (float), "
            "net_new_mrr (float), arpu (float, avg revenue per user), created_at (timestamptz). "
            "Example MRR trend: SELECT date, mrr, churn_mrr FROM metrics_daily "
            "WHERE company_id=:cid ORDER BY date DESC LIMIT 30. "
            "Example monthly churn: SELECT date_trunc('month', date) as month, SUM(churn_mrr) "
            "FROM metrics_daily WHERE company_id=:cid GROUP BY month ORDER BY month."
        ),
    },
    {
        "table_name": "invoices",
        "description": (
            "Invoice records for subscriptions. "
            "Columns: id (uuid), subscription_id (uuid, FK), company_id (uuid, tenant), "
            "stripe_invoice_id (varchar), amount (float, invoice total), "
            "status (varchar: 'paid', 'open', 'void', 'uncollectible'), "
            "paid_at (timestamptz), period_start (timestamptz), period_end (timestamptz), "
            "created_at (timestamptz). "
            "Use for revenue collection analysis and failed payment detection."
        ),
    },
    {
        "table_name": "anomaly_alerts",
        "description": (
            "ML-detected revenue anomalies and alerts. "
            "Columns: id (uuid), company_id (uuid, tenant), metric_name (varchar), "
            "detected_at (timestamptz), severity (varchar: 'low', 'medium', 'high', 'critical'), "
            "z_score (float, statistical deviation), expected_value (float), actual_value (float), "
            "explanation (text, human-readable description), is_active (bool), "
            "resolved_at (timestamptz, null if unresolved), created_at (timestamptz). "
            "Example: SELECT metric_name, severity, explanation FROM anomaly_alerts "
            "WHERE company_id=:cid AND is_active=true ORDER BY detected_at DESC."
        ),
    },
]


async def seed():
    print("Seeding schema_embeddings...")

    async with get_session() as session:
        # Clear existing
        await session.execute(text("DELETE FROM schema_embeddings"))
        await session.commit()

    for entry in SCHEMA_DESCRIPTIONS:
        response = await client.embeddings.create(
            model=settings.openai_embedding_model,
            input=entry["description"],
        )
        embedding = response.data[0].embedding
        embedding_str = f"[{','.join(str(x) for x in embedding)}]"

        async with get_session() as session:
            await session.execute(
                text("""
                    INSERT INTO schema_embeddings (id, table_name, description, embedding)
                    VALUES (gen_random_uuid(), :table_name, :description, CAST(:embedding AS vector))
                """),
                {
                    "table_name": entry["table_name"],
                    "description": entry["description"],
                    "embedding": embedding_str,
                }
            )
            await session.commit()

        print(f"  ✓ {entry['table_name']}")

    print("Done.")


if __name__ == "__main__":
    asyncio.run(seed())
