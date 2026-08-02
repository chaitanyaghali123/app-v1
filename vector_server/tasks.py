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
def ingest_file_task(self, file_path, subject_id=None):
    from ingest_hybrid import process_file, ensure_tables
    import os as _os

    logger.info(
        f"Celery task started: ingest_file {file_path}"
    )

    try:
        ensure_tables()

        process_file(Path(file_path), subject_id=subject_id)

        logger.info(
            f"Celery task completed: ingest_file {file_path}"
        )

        uploaded_path = Path(file_path)

        if uploaded_path.is_absolute() and uploaded_path.exists():

            try:

                _os.remove(uploaded_path)

                logger.info(
                    f"Cleaned up uploaded file: {file_path}"
                )

            except Exception as cleanup_exc:

                logger.warning(
                    f"Failed to clean up {file_path}: {cleanup_exc}"
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
