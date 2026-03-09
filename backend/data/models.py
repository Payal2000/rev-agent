"""SQLAlchemy ORM models for RevAgent — all 9 tables + pgvector schema store."""
import uuid
from datetime import datetime
from typing import Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger, Boolean, Column, DateTime, Float, ForeignKey,
    Index, Integer, String, Text, UniqueConstraint, text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


def gen_uuid():
    return str(uuid.uuid4())


# ── companies ─────────────────────────────────────────────────────────────────

class Company(Base):
    __tablename__ = "companies"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name = Column(String(255), nullable=False)
    stripe_account_id = Column(String(255), unique=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))
    updated_at = Column(DateTime(timezone=True), server_default=text("NOW()"), onupdate=datetime.utcnow)

    customers = relationship("Customer", back_populates="company")
    metrics = relationship("MetricsDaily", back_populates="company")


# ── customers ─────────────────────────────────────────────────────────────────

class Customer(Base):
    __tablename__ = "customers"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    company_id = Column(UUID(as_uuid=False), ForeignKey("companies.id"), nullable=False, index=True)
    stripe_customer_id = Column(String(255), unique=True, nullable=True)
    email = Column(String(255), nullable=False)
    name = Column(String(255))
    segment = Column(String(50))  # SMB / Mid-Market / Enterprise
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))

    company = relationship("Company", back_populates="customers")
    subscriptions = relationship("Subscription", back_populates="customer")

    __table_args__ = (
        Index("idx_customers_company", "company_id"),
        Index("idx_customers_stripe", "stripe_customer_id"),
    )


# ── subscriptions ─────────────────────────────────────────────────────────────

class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    customer_id = Column(UUID(as_uuid=False), ForeignKey("customers.id"), nullable=False)
    company_id = Column(UUID(as_uuid=False), ForeignKey("companies.id"), nullable=False)
    stripe_subscription_id = Column(String(255), unique=True, nullable=True)
    plan_tier = Column(String(50), nullable=False)  # Starter / Growth / Enterprise
    status = Column(String(50), nullable=False)     # active / canceled / trialing / past_due
    mrr_amount = Column(Float, nullable=False, default=0.0)
    started_at = Column(DateTime(timezone=True))
    canceled_at = Column(DateTime(timezone=True), nullable=True)
    cancel_reason = Column(String(255), nullable=True)
    trial_end = Column(DateTime(timezone=True), nullable=True)
    extra = Column("metadata", JSONB, default={})
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))
    updated_at = Column(DateTime(timezone=True), server_default=text("NOW()"), onupdate=datetime.utcnow)

    customer = relationship("Customer", back_populates="subscriptions")
    events = relationship("SubscriptionEvent", back_populates="subscription")
    invoices = relationship("Invoice", back_populates="subscription")

    __table_args__ = (
        Index("idx_subscriptions_company_status", "company_id", "status"),
        Index("idx_subscriptions_customer", "customer_id"),
    )


# ── invoices ──────────────────────────────────────────────────────────────────

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    subscription_id = Column(UUID(as_uuid=False), ForeignKey("subscriptions.id"), nullable=False)
    company_id = Column(UUID(as_uuid=False), ForeignKey("companies.id"), nullable=False)
    stripe_invoice_id = Column(String(255), unique=True, nullable=True)
    amount = Column(Float, nullable=False)
    status = Column(String(50), nullable=False)   # paid / open / void / uncollectible
    paid_at = Column(DateTime(timezone=True), nullable=True)
    period_start = Column(DateTime(timezone=True))
    period_end = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))

    subscription = relationship("Subscription", back_populates="invoices")

    __table_args__ = (
        Index("idx_invoices_company", "company_id"),
        Index("idx_invoices_subscription", "subscription_id"),
    )


# ── subscription_events ───────────────────────────────────────────────────────

class SubscriptionEvent(Base):
    __tablename__ = "subscription_events"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    subscription_id = Column(UUID(as_uuid=False), ForeignKey("subscriptions.id"), nullable=False)
    company_id = Column(UUID(as_uuid=False), ForeignKey("companies.id"), nullable=False)
    event_type = Column(String(50), nullable=False)  # new / upgrade / downgrade / churn / reactivation
    old_mrr = Column(Float, default=0.0)
    new_mrr = Column(Float, default=0.0)
    mrr_delta = Column(Float, default=0.0)
    timestamp = Column(DateTime(timezone=True), server_default=text("NOW()"))
    extra = Column("metadata", JSONB, default={})

    subscription = relationship("Subscription", back_populates="events")

    __table_args__ = (
        Index("idx_sub_events_company_date", "company_id", "timestamp"),
        Index("idx_sub_events_type", "event_type"),
    )


# ── metrics_daily ─────────────────────────────────────────────────────────────

class MetricsDaily(Base):
    __tablename__ = "metrics_daily"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    company_id = Column(UUID(as_uuid=False), ForeignKey("companies.id"), nullable=False)
    date = Column(DateTime(timezone=True), nullable=False)
    mrr = Column(Float, default=0.0)
    arr = Column(Float, default=0.0)
    active_subscribers = Column(Integer, default=0)
    churned_count = Column(Integer, default=0)
    new_subscribers = Column(Integer, default=0)
    expansion_mrr = Column(Float, default=0.0)
    contraction_mrr = Column(Float, default=0.0)
    new_mrr = Column(Float, default=0.0)
    churn_mrr = Column(Float, default=0.0)
    net_new_mrr = Column(Float, default=0.0)
    arpu = Column(Float, default=0.0)
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))

    company = relationship("Company", back_populates="metrics")

    __table_args__ = (
        UniqueConstraint("company_id", "date", name="uq_metrics_company_date"),
        Index("idx_metrics_company_date", "company_id", "date"),
    )


# ── anomaly_alerts ────────────────────────────────────────────────────────────

class AnomalyAlert(Base):
    __tablename__ = "anomaly_alerts"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    company_id = Column(UUID(as_uuid=False), ForeignKey("companies.id"), nullable=False)
    metric_name = Column(String(100), nullable=False)
    current_value = Column(Float)
    baseline_value = Column(Float)
    z_score = Column(Float)
    severity = Column(String(20), default="medium")  # low / medium / high / critical
    explanation = Column(Text)
    detected_at = Column(DateTime(timezone=True), server_default=text("NOW()"))
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)


# ── audit_log ─────────────────────────────────────────────────────────────────

class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    company_id = Column(UUID(as_uuid=False), nullable=True)
    agent_id = Column(String(100), nullable=False)
    trace_id = Column(String(255), nullable=True)  # LangSmith trace ID
    input_hash = Column(String(64))
    output_hash = Column(String(64))
    validation_score = Column(Float, nullable=True)
    checks_passed = Column(JSONB, default=[])
    checks_failed = Column(JSONB, default=[])
    decision = Column(String(20), nullable=False)  # approve / reject
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))

    __table_args__ = (
        Index("idx_audit_company_date", "company_id", "created_at"),
        Index("idx_audit_trace", "trace_id"),
    )


# ── agent_memory ──────────────────────────────────────────────────────────────

class AgentMemory(Base):
    __tablename__ = "agent_memory"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    company_id = Column(UUID(as_uuid=False), ForeignKey("companies.id"), nullable=False)
    memory_type = Column(String(50), nullable=False)  # insight / recommendation / preference
    content_text = Column(Text, nullable=False)
    content_embedding = Column(Vector(1536), nullable=True)
    outcome = Column(String(50), nullable=True)  # successful / failed / pending
    extra = Column("metadata", JSONB, default={})
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))

    __table_args__ = (
        Index("idx_memory_company", "company_id"),
    )


# ── schema_embeddings (Query Agent RAG) ───────────────────────────────────────

class SchemaEmbedding(Base):
    __tablename__ = "schema_embeddings"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    table_name = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)  # full business-context doc
    embedding = Column(Vector(1536), nullable=False)
    extra = Column("metadata", JSONB, default={})
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))

    __table_args__ = (
        Index("idx_schema_table", "table_name"),
    )


# ── rag_playbook (Action Agent) ───────────────────────────────────────────────

class RagPlaybook(Base):
    __tablename__ = "rag_playbook"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    category = Column(String(100), nullable=False)   # churn_reduction / expansion / pricing
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(1536), nullable=False)
    estimated_impact = Column(String(100), nullable=True)  # e.g. "$50K ARR"
    tags = Column(JSONB, default=[])
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))
