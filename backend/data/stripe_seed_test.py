"""
Seed realistic SaaS test data in Stripe Test Mode.

Creates:
  - 3 Products (Starter / Growth / Enterprise)
  - 3 Prices (monthly recurring)
  - 30 Customers across segments
  - 30 Subscriptions (mix of active, canceled, trialing)
  - Simulated churn spike in Enterprise tier (for anomaly demo)

Run:
  STRIPE_SECRET_KEY=sk_test_... python -m data.stripe_seed_test
"""

import asyncio
import random
import time
import stripe
from config import settings

random.seed(42)

PLANS = [
    {"name": "Starter",    "amount": 4900,  "weight": 0.5},   # $49/mo
    {"name": "Growth",     "amount": 19900, "weight": 0.35},  # $199/mo
    {"name": "Enterprise", "amount": 99900, "weight": 0.15},  # $999/mo
]

FIRST_NAMES = ["Alex", "Jordan", "Morgan", "Taylor", "Casey", "Riley", "Drew", "Avery", "Quinn", "Blake",
               "Sam", "Jamie", "Dana", "Skyler", "Reese", "Parker", "Logan", "Devon", "Sage", "Rowan"]
LAST_NAMES  = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Martinez", "Davis", "Wilson", "Anderson",
               "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Robinson", "Clark", "Lewis", "Walker"]
DOMAINS     = ["acme.com", "techcorp.io", "saasify.co", "cloudworks.net", "devhub.app",
               "launchpad.io", "growthly.co", "scalehq.com", "stackworks.io", "pivotapp.net"]

CANCEL_REASONS = ["pricing", "competitor", "reduced_usage", "feature_gap", "budget_cut"]


def init_stripe():
    key = settings.stripe_secret_key
    if not key or not key.startswith("sk_test_"):
        raise ValueError(
            "STRIPE_SECRET_KEY must be a test key (sk_test_...). "
            "Get yours from https://dashboard.stripe.com/test/apikeys"
        )
    stripe.api_key = key
    print(f"✓ Using Stripe test key: {key[:12]}...")


def create_products_and_prices() -> dict[str, str]:
    """Create products and prices, return {plan_name: price_id}."""
    price_ids = {}

    for plan in PLANS:
        # Check if product already exists
        existing = stripe.Product.search(query=f"name:'{plan['name']} - RevAgent Test'")
        if existing.data:
            product = existing.data[0]
            print(f"  ↩ Product exists: {plan['name']} ({product.id})")
        else:
            product = stripe.Product.create(
                name=f"{plan['name']} - RevAgent Test",
                metadata={"revagent_test": "true", "tier": plan["name"]},
            )
            print(f"  ✓ Created product: {plan['name']} ({product.id})")

        # Check if price already exists for this product
        prices = stripe.Price.list(product=product.id, active=True, limit=1)
        if prices.data:
            price = prices.data[0]
            print(f"  ↩ Price exists: ${plan['amount']/100:.0f}/mo ({price.id})")
        else:
            price = stripe.Price.create(
                product=product.id,
                unit_amount=plan["amount"],
                currency="usd",
                recurring={"interval": "month"},
                metadata={"tier": plan["name"]},
            )
            print(f"  ✓ Created price: ${plan['amount']/100:.0f}/mo ({price.id})")

        price_ids[plan["name"]] = price.id

    return price_ids


def create_test_customers_and_subscriptions(
    price_ids: dict[str, str],
    company_id: str,
    count: int = 30,
) -> dict:
    """Create customers and subscriptions, return summary stats."""
    stats = {"created": 0, "active": 0, "canceled": 0, "trialing": 0}

    # Determine plan distribution
    plan_names = [p["name"] for p in PLANS]
    weights    = [p["weight"] for p in PLANS]

    for i in range(count):
        first  = random.choice(FIRST_NAMES)
        last   = random.choice(LAST_NAMES)
        domain = random.choice(DOMAINS)
        email  = f"{first.lower()}.{last.lower()}.{i}@{domain}"
        plan   = random.choices(plan_names, weights=weights, k=1)[0]

        # Simulate Enterprise churn spike (for anomaly detection demo)
        # ~40% of Enterprise accounts churned recently
        is_enterprise_churn = (plan == "Enterprise" and random.random() < 0.40)
        # Small churn for other tiers
        is_other_churn = (plan != "Enterprise" and random.random() < 0.08)
        should_cancel = is_enterprise_churn or is_other_churn

        try:
            # Create customer
            customer = stripe.Customer.create(
                email=email,
                name=f"{first} {last}",
                metadata={
                    "company_id": company_id,
                    "segment": {"Starter": "SMB", "Growth": "Mid-Market", "Enterprise": "Enterprise"}[plan],
                    "revagent_test": "true",
                },
            )

            # Create subscription
            # Use trial for ~10% of starters to demo trialing status
            is_trial = (plan == "Starter" and random.random() < 0.10)

            sub_params: dict = {
                "customer": customer.id,
                "items": [{"price": price_ids[plan]}],
                "metadata": {
                    "company_id": company_id,
                    "plan_tier": plan,
                    "revagent_test": "true",
                },
                # Stripe test mode: use test payment method token
                "default_payment_method": _attach_test_payment_method(customer.id),
            }

            if is_trial:
                # Trial ending in 7 days
                sub_params["trial_end"] = int(time.time()) + 7 * 24 * 3600

            subscription = stripe.Subscription.create(**sub_params)

            stats["created"] += 1

            if should_cancel:
                # Cancel the subscription
                cancel_reason = random.choices(
                    CANCEL_REASONS,
                    weights=[0.45, 0.25, 0.20, 0.07, 0.03],
                    k=1
                )[0]
                stripe.Subscription.cancel(
                    subscription.id,
                    cancellation_details={"comment": cancel_reason},
                )
                # Store cancel reason in customer metadata
                stripe.Customer.modify(
                    customer.id,
                    metadata={"cancel_reason": cancel_reason, **customer.metadata}
                )
                stats["canceled"] += 1
                print(f"  ✓ [{plan:10s}] {email} — canceled ({cancel_reason})")
            elif is_trial:
                stats["trialing"] += 1
                print(f"  ✓ [{plan:10s}] {email} — trialing")
            else:
                stats["active"] += 1
                print(f"  ✓ [{plan:10s}] {email} — active")

        except stripe.errors.StripeError as e:
            print(f"  ✗ Failed for {email}: {e}")
            continue

    return stats


def _attach_test_payment_method(customer_id: str) -> str:
    """Attach Stripe's built-in test payment method token to a customer."""
    pm = stripe.PaymentMethod.create(
        type="card",
        card={"token": "tok_visa"},  # Stripe test token — always succeeds
    )
    stripe.PaymentMethod.attach(pm.id, customer=customer_id)
    stripe.Customer.modify(
        customer_id,
        invoice_settings={"default_payment_method": pm.id}
    )
    return pm.id


def print_summary(stats: dict, price_ids: dict):
    print("\n" + "="*55)
    print("  Stripe Test Data Seed Complete")
    print("="*55)
    print(f"  Subscriptions created : {stats['created']}")
    print(f"  Active                : {stats['active']}")
    print(f"  Canceled (churned)    : {stats['canceled']}")
    print(f"  Trialing              : {stats['trialing']}")
    print()
    print("  Price IDs (add to .env or use in sync):")
    for tier, price_id in price_ids.items():
        print(f"    {tier:12s}: {price_id}")
    print()
    print("  Next steps:")
    print("  1. Copy your test keys to .env")
    print("     STRIPE_SECRET_KEY=sk_test_...")
    print("     STRIPE_WEBHOOK_SECRET=whsec_... (from: stripe listen --print-secret)")
    print()
    print("  2. Run Stripe sync to pull data into Postgres:")
    print("     python -m data.stripe_sync <company_id>")
    print()
    print("  3. Forward webhooks to your local backend:")
    print("     stripe listen --forward-to localhost:8000/api/webhook/stripe")
    print("="*55)


def main():
    init_stripe()

    company_id = "00000000-0000-0000-0000-000000000001"  # demo company
    num_customers = 30  # keep small for test — change to 150 for fuller demo

    print("\nStep 1: Creating products & prices...")
    price_ids = create_products_and_prices()

    print(f"\nStep 2: Creating {num_customers} test customers & subscriptions...")
    print("  (This includes a simulated Enterprise churn spike for anomaly detection demo)\n")
    stats = create_test_customers_and_subscriptions(price_ids, company_id, count=num_customers)

    print_summary(stats, price_ids)


if __name__ == "__main__":
    main()
