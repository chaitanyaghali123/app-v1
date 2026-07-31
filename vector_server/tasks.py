import logging
from pathlib import Path
from celery_app import celery

logger = logging.getLogger(__name__)


@celery.task(
    bind=True,
    name="ingestFolder",
    max_retries=1,
    acks_late=True,
    track_started=True
)
def ingest_folder_task(self, folder_path):
    from ingest_hybrid import ingest_folder

    logger.info(
        f"Celery task started: ingest_folder {folder_path}"
    )

    try:
        ingest_folder(folder_path)

        logger.info(
            f"Celery task completed: ingest_folder {folder_path}"
        )

        return {
            "status": "completed",
            "folder": folder_path
        }

    except Exception as e:

        logger.exception(
            f"Celery task failed: ingest_folder {folder_path}: {e}"
        )

        raise self.retry(
            exc=e,
            countdown=30
        )


@celery.task(
    bind=True,
    name="ingestFile",
    max_retries=1,
    acks_late=True,
    track_started=True
)
def ingest_file_task(self, file_path):
    from ingest_hybrid import process_file, ensure_tables

    logger.info(
        f"Celery task started: ingest_file {file_path}"
    )

    try:
        ensure_tables()

        process_file(Path(file_path))

        logger.info(
            f"Celery task completed: ingest_file {file_path}"
        )

        return {
            "status": "completed",
            "file": file_path
        }

    except Exception as e:

        logger.exception(
            f"Celery task failed: ingest_file {file_path}: {e}"
        )

        raise self.retry(
            exc=e,
            countdown=30
        )
