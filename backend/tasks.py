"""
tasks.py — Celery async tasks for video segmentation.
"""

import os
import json
import logging
from celery import Celery
from inference import process_video, VOC_CLASSES

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "video_seg",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    result_expires=3600,  # results expire in 1 hour
)


@celery_app.task(bind=True, name="tasks.segment_video")
def segment_video_task(self, job_id: str, input_path: str, output_path: str):
    """
    Celery task: runs video segmentation and updates progress via Redis.
    Progress is stored in Celery's backend so FastAPI can poll it.
    """
    try:
        self.update_state(
            state="PROGRESS",
            meta={"pct": 0.0, "detected": [], "status": "starting"},
        )

        def on_progress(pct, detected_names):
            self.update_state(
                state="PROGRESS",
                meta={
                    "pct": pct,
                    "detected": detected_names,
                    "status": "processing",
                },
            )

        detected = process_video(
            input_path=input_path,
            output_path=output_path,
            progress_callback=on_progress,
        )

        detected_names = [
            VOC_CLASSES[c] for c in sorted(detected) if c < len(VOC_CLASSES)
        ]

        return {
            "status": "done",
            "pct": 100.0,
            "detected": detected_names,
            "output_path": output_path,
        }

    except Exception as exc:
        self.update_state(
            state="FAILURE",
            meta={"status": "error", "error": str(exc)},
        )
        raise exc
