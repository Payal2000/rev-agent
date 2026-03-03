"""Celery app configuration with Redis broker."""
from celery import Celery
from config import settings

celery_app = Celery(
    "revagent",
    broker=settings.redis_url,
    backend=settings.redis_url.replace("/0", "/1"),  # separate Redis DB for results
    include=["tasks.scheduled"],
)

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # Reliability
    task_acks_late=True,              # don't lose tasks on worker crash
    task_reject_on_worker_lost=True,  # re-queue on worker failure
    worker_prefetch_multiplier=1,     # one task at a time per worker (prevents starvation)

    # Routing
    task_routes={
        "tasks.scheduled.run_daily_briefing": {"queue": "scheduled"},
        "tasks.scheduled.run_insights_pipeline": {"queue": "agents"},
    },

    # Beat schedule (daily briefing at 6:00 AM UTC)
    beat_schedule={
        "daily-briefing": {
            "task": "tasks.scheduled.run_daily_briefing",
            "schedule": 21600.0,  # every 6 hours for demo; use crontab in production
            # Production: crontab(hour=6, minute=0) for 6AM daily
        }
    },

    timezone="UTC",
)
