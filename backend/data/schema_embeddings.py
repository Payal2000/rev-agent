"""Embed enriched schema descriptions into pgvector for Query Agent retrieval."""
import asyncio
import json
import logging

from openai import AsyncOpenAI
from sqlalchemy.dialects.postgresql import insert as pg_insert

from config import settings
from data.database import get_session
from data.models import SchemaEmbedding, RagPlaybook

logger = logging.getLogger(__name__)
openai_client = AsyncOpenAI(api_key=settings.openai_api_key)


# ── Schema documents ──────────────────────────────────────────────────────────
# Each entry is what the Query Agent will retrieve when a user asks a question.
# The more business context here, the better the SQL generation.

SCHEMA_DOCS = [
    {
        "table_name": "companies",
        "description": (
            "The companies table stores each SaaS tenant using RevAgent. "
            "Every other table is scoped to a company via company_id. "
            "Use this to join when you need company name or stripe_account_id."
        ),
        "columns": "id (UUID PK), name (company name), stripe_account_id, created_at",
        "common_queries": "SELECT name FROM companies WHERE id = <company_id>",
    },
    {
        "table_name": "customers",
        "description": (
            "The customers table stores all subscribers of a SaaS company. "
            "Each customer belongs to one company and maps to a Stripe customer. "
            "The segment field classifies customers as SMB, Mid-Market, or Enterprise. "
            "Use to analyze customer counts, segments, and growth."
        ),
        "columns": "id, company_id, stripe_customer_id, email, name, segment, created_at",
        "common_queries": (
            "COUNT customers by segment: SELECT segment, COUNT(*) FROM customers WHERE company_id=? GROUP BY segment. "
            "New customers this month: WHERE created_at >= DATE_TRUNC('month', NOW())"
        ),
    },
    {
        "table_name": "subscriptions",
        "description": (
            "The subscriptions table is the core revenue table. "
            "It stores every subscription with its plan tier (Starter/Growth/Enterprise), "
            "current status (active/canceled/trialing/past_due), and MRR amount in dollars. "
            "To calculate total MRR: SUM(mrr_amount) WHERE status='active'. "
            "To calculate churn: COUNT(*) WHERE status='canceled' AND canceled_at >= <period>. "
            "cancel_reason captures why the customer left (pricing, competitor, reduced_usage)."
        ),
        "columns": "id, customer_id, company_id, stripe_subscription_id, plan_tier, status, mrr_amount, started_at, canceled_at, cancel_reason, trial_end",
        "common_queries": (
            "MRR: SELECT SUM(mrr_amount) FROM subscriptions WHERE company_id=? AND status='active'. "
            "MRR by tier: SELECT plan_tier, SUM(mrr_amount) FROM subscriptions WHERE status='active' GROUP BY plan_tier. "
            "Churn last 30 days: WHERE status='canceled' AND canceled_at >= NOW()-INTERVAL '30 days'. "
            "Churn by reason: SELECT cancel_reason, COUNT(*) FROM subscriptions WHERE status='canceled' GROUP BY cancel_reason"
        ),
    },
    {
        "table_name": "invoices",
        "description": (
            "The invoices table stores all billing records. "
            "Each invoice belongs to a subscription and has a status: paid, open, void, or uncollectible. "
            "Use to track payment history, failed payments, and revenue collected vs billed. "
            "amount is in dollars. period_start/period_end define the billing period."
        ),
        "columns": "id, subscription_id, company_id, stripe_invoice_id, amount, status, paid_at, period_start, period_end",
        "common_queries": (
            "Revenue collected this month: SELECT SUM(amount) FROM invoices WHERE status='paid' AND paid_at >= DATE_TRUNC('month', NOW()). "
            "Failed payments: WHERE status='open' or 'uncollectible'. "
            "Payment failure rate: COUNT FILTER WHERE status IN ('open','uncollectible') / COUNT(*)"
        ),
    },
    {
        "table_name": "subscription_events",
        "description": (
            "The subscription_events table tracks every change to a subscription's MRR. "
            "event_type values: new (new subscriber), upgrade (plan upgrade), downgrade (plan downgrade), "
            "churn (cancellation), reactivation (win-back). "
            "old_mrr and new_mrr capture the MRR before and after the event. "
            "mrr_delta = new_mrr - old_mrr (positive for expansion, negative for contraction). "
            "Use to calculate net MRR movement, expansion revenue, and contraction revenue."
        ),
        "columns": "id, subscription_id, company_id, event_type, old_mrr, new_mrr, mrr_delta, timestamp",
        "common_queries": (
            "Net MRR movement by month: SELECT DATE_TRUNC('month', timestamp), SUM(mrr_delta) GROUP BY 1. "
            "Expansion MRR: SUM(mrr_delta) WHERE event_type='upgrade'. "
            "Churn MRR: SUM(old_mrr) WHERE event_type='churn'. "
            "New MRR: SUM(new_mrr) WHERE event_type='new'"
        ),
    },
    {
        "table_name": "metrics_daily",
        "description": (
            "The metrics_daily table stores pre-aggregated daily revenue metrics per company. "
            "Use this for time-series analysis, trend detection, and historical comparisons — "
            "it is much faster than computing from raw subscriptions. "
            "Key metrics: mrr (monthly recurring revenue), arr (annual recurring revenue), "
            "active_subscribers, churned_count, expansion_mrr, contraction_mrr, net_new_mrr, arpu (average revenue per user)."
        ),
        "columns": "id, company_id, date, mrr, arr, active_subscribers, churned_count, new_subscribers, expansion_mrr, contraction_mrr, new_mrr, churn_mrr, net_new_mrr, arpu",
        "common_queries": (
            "MRR over last 90 days: SELECT date, mrr FROM metrics_daily WHERE company_id=? ORDER BY date DESC LIMIT 90. "
            "MRR growth rate: compare this week's mrr vs last week's. "
            "Churn trend: SELECT date, churned_count FROM metrics_daily ORDER BY date. "
            "ARPU over time: SELECT date, arpu FROM metrics_daily ORDER BY date"
        ),
    },
    {
        "table_name": "anomaly_alerts",
        "description": (
            "The anomaly_alerts table stores detected metric anomalies. "
            "Each alert has the metric name, current value, baseline value, z_score (how many standard deviations from normal), "
            "severity (low/medium/high/critical), and a human-readable explanation. "
            "is_active=true means the anomaly is currently ongoing."
        ),
        "columns": "id, company_id, metric_name, current_value, baseline_value, z_score, severity, explanation, detected_at, resolved_at, is_active",
        "common_queries": (
            "Active anomalies: SELECT * FROM anomaly_alerts WHERE company_id=? AND is_active=true ORDER BY z_score DESC. "
            "Recent anomalies: WHERE detected_at >= NOW()-INTERVAL '7 days'"
        ),
    },
    {
        "table_name": "audit_log",
        "description": (
            "The audit_log table stores every agent decision and validation result. "
            "Each row links an agent action to its LangSmith trace_id for full reproducibility. "
            "validation_score is 1-5. decision is approve or reject."
        ),
        "columns": "id, company_id, agent_id, trace_id, input_hash, output_hash, validation_score, checks_passed, checks_failed, decision, reason, created_at",
        "common_queries": "Recent agent decisions: SELECT agent_id, decision, reason FROM audit_log ORDER BY created_at DESC LIMIT 20",
    },
    {
        "table_name": "agent_memory",
        "description": (
            "The agent_memory table stores the agent's long-term memory: past insights, recommendations, and user preferences. "
            "content_embedding enables semantic search for similar past situations. "
            "outcome tracks whether a recommendation was successful."
        ),
        "columns": "id, company_id, memory_type, content_text, content_embedding, outcome, metadata, created_at",
        "common_queries": "Successful past recommendations: SELECT content_text FROM agent_memory WHERE memory_type='recommendation' AND outcome='successful'",
    },
]


# ── RAG Playbook entries ───────────────────────────────────────────────────────

PLAYBOOK_ENTRIES = [
    {
        "category": "churn_reduction",
        "title": "Pricing Lock for At-Risk Enterprise Accounts",
        "content": (
            "When Enterprise accounts show pricing sensitivity signals (cancel_reason='pricing', "
            "usage decline >20%, or explicit pricing objection in support), offer a 12-24 month "
            "pricing lock at current rates. Success rate: ~65% retention. "
            "Best executed within 48 hours of churn signal detection. "
            "Requires VP Sales approval for accounts >$50K ARR."
        ),
        "estimated_impact": "$80K-$130K ARR per cohort",
        "tags": ["churn", "enterprise", "pricing", "retention"],
    },
    {
        "category": "churn_reduction",
        "title": "Usage-Based Discount for Declining Engagement",
        "content": (
            "For accounts with >30% decline in product usage over 60 days, "
            "offer a temporary 20-30% discount tied to a re-engagement commitment. "
            "Pair with a dedicated customer success touchpoint. "
            "Most effective for Growth tier accounts. "
            "Estimated save rate: 40-50%."
        ),
        "estimated_impact": "$30K-$60K ARR",
        "tags": ["churn", "growth", "usage", "discount"],
    },
    {
        "category": "churn_reduction",
        "title": "Executive Outreach for High-Value Churning Accounts",
        "content": (
            "For accounts representing >1% of total MRR that show churn signals, "
            "trigger immediate VP/C-suite outreach within 24 hours. "
            "Personalized business review, custom renewal terms. "
            "Success rate: 70-80% when executed within 48h of signal."
        ),
        "estimated_impact": "Variable — depends on account MRR",
        "tags": ["churn", "enterprise", "executive", "high-value"],
    },
    {
        "category": "expansion",
        "title": "Upsell Trigger: Feature Adoption Threshold",
        "content": (
            "When a Starter or Growth account consistently uses >80% of their plan's "
            "feature limits for 14+ consecutive days, trigger an upgrade nudge. "
            "Automated in-app + email sequence showing Enterprise features they're missing. "
            "Conversion rate from nudge to upgrade: 25-35%."
        ),
        "estimated_impact": "$20K-$50K ARR monthly",
        "tags": ["expansion", "upsell", "product-led", "growth"],
    },
    {
        "category": "expansion",
        "title": "Annual Billing Conversion Campaign",
        "content": (
            "Monthly subscribers who have been active for >6 months and have never missed a payment "
            "are prime targets for annual billing conversion (offer 2 months free). "
            "Reduces involuntary churn by 60%, improves cash flow, and reduces payment failure exposure."
        ),
        "estimated_impact": "15-20% reduction in involuntary churn",
        "tags": ["expansion", "annual", "billing", "retention"],
    },
    {
        "category": "pricing",
        "title": "Enterprise Tier Pricing Review After Churn Spike",
        "content": (
            "If Enterprise churn rate exceeds 5% in a rolling 30-day window, "
            "initiate a structured pricing review. Survey churned accounts, "
            "benchmark against competitors, and evaluate: grandfathering existing customers, "
            "introducing a mid-tier between Growth and Enterprise, or adjusting included features. "
            "Typical timeline: 4-6 weeks to implement pricing change."
        ),
        "estimated_impact": "Prevent $100K-$500K ARR at risk",
        "tags": ["pricing", "enterprise", "churn", "strategy"],
    },
    {
        "category": "churn_reduction",
        "title": "Payment Failure Recovery Automation",
        "content": (
            "For failed payments, implement smart retry logic: "
            "retry 3x over 7 days, send dunning emails at days 1, 3, 7. "
            "At day 7, trigger personal outreach from CS rep. "
            "Recovers 60-70% of failed payments vs 20-30% without active dunning."
        ),
        "estimated_impact": "Recover 40-50% of payment failure MRR",
        "tags": ["churn", "payments", "dunning", "automation"],
    },
]


# ── Embedding helpers ─────────────────────────────────────────────────────────

async def embed_text(text: str) -> list[float]:
    response = await openai_client.embeddings.create(
        model=settings.openai_embedding_model,
        input=text,
    )
    return response.data[0].embedding


def _schema_doc_to_text(doc: dict) -> str:
    return (
        f"Table: {doc['table_name']}\n"
        f"Description: {doc['description']}\n"
        f"Columns: {doc['columns']}\n"
        f"Common queries: {doc['common_queries']}"
    )


# ── Store schema embeddings ───────────────────────────────────────────────────

async def embed_and_store_schema():
    """Embed all schema docs and store in pgvector."""
    logger.info("Embedding schema documents...")

    async with get_session() as session:
        for doc in SCHEMA_DOCS:
            text_for_embedding = _schema_doc_to_text(doc)
            embedding = await embed_text(text_for_embedding)

            stmt = pg_insert(SchemaEmbedding).values(
                table_name=doc["table_name"],
                description=text_for_embedding,
                embedding=embedding,
                metadata={"columns": doc["columns"], "common_queries": doc["common_queries"]},
            ).on_conflict_do_update(
                index_elements=["table_name"],
                set_={
                    "description": text_for_embedding,
                    "embedding": embedding,
                }
            )
            await session.execute(stmt)
            logger.info(f"  ✓ Embedded schema: {doc['table_name']}")

    logger.info(f"Schema embedding complete — {len(SCHEMA_DOCS)} tables stored")


# ── Store RAG playbook ────────────────────────────────────────────────────────

async def embed_and_store_playbook():
    """Embed all playbook entries and store in pgvector."""
    logger.info("Embedding RAG playbook entries...")

    async with get_session() as session:
        for entry in PLAYBOOK_ENTRIES:
            text_for_embedding = f"{entry['title']}\n{entry['content']}"
            embedding = await embed_text(text_for_embedding)

            stmt = pg_insert(RagPlaybook).values(
                category=entry["category"],
                title=entry["title"],
                content=entry["content"],
                embedding=embedding,
                estimated_impact=entry.get("estimated_impact", ""),
                tags=entry.get("tags", []),
            ).on_conflict_do_nothing()
            await session.execute(stmt)
            logger.info(f"  ✓ Embedded playbook: {entry['title']}")

    logger.info(f"Playbook embedding complete — {len(PLAYBOOK_ENTRIES)} entries stored")


async def run_all():
    await embed_and_store_schema()
    await embed_and_store_playbook()


if __name__ == "__main__":
    asyncio.run(run_all())
