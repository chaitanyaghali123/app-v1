import os
from celery import Celery

celery = Celery(
    "ingest",
    broker=os.getenv(
        "CELERY_BROKER_URL",
        "redis://redis:6379/0"
    ),
    backend=os.getenv(
        "CELERY_RESULT_BACKEND",
        "redis://redis:6379/1"
    ),
    include=["tasks"]
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=int(
        os.getenv("CELERY_TASK_TIME_LIMIT", "1800")
    ),
    task_soft_time_limit=int(
        os.getenv("CELERY_TASK_SOFT_TIME_LIMIT", "1500")
    ),
    worker_concurrency=int(
        os.getenv("CELERY_WORKER_CONCURRENCY", "4")
    ),
    worker_max_tasks_per_child=10,
    worker_max_memory_per_child=1000000,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
)
