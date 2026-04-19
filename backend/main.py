"""
main.py — FastAPI backend for Video Segmentation App.

Endpoints:
  POST /api/upload         → Upload video, returns job_id
  GET  /api/status/{id}   → Job status + progress
  GET  /api/video/{id}    → Stream result video
  WS   /ws/{id}           → WebSocket real-time progress
  GET  /api/health        → Health check
"""

import os
import uuid
import asyncio
import logging
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from celery.result import AsyncResult

from tasks import celery_app, segment_video_task
from inference import get_model  # pre-load model at startup

# ─── Config ──────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/tmp/video_seg/uploads"))
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "/tmp/video_seg/outputs"))
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "200"))
ALLOWED_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Video Segmentation API",
    description="Upload a video and get semantic segmentation overlay",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Startup: warm up the model ───────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    logger.info("Warming up segmentation model …")
    get_model()
    logger.info("Model ready.")


# ─── WebSocket connection manager ─────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}

    async def connect(self, job_id: str, ws: WebSocket):
        await ws.accept()
        self.active.setdefault(job_id, []).append(ws)

    def disconnect(self, job_id: str, ws: WebSocket):
        if job_id in self.active:
            try:
                self.active[job_id].remove(ws)
            except ValueError:
                pass

    async def broadcast(self, job_id: str, data: dict):
        for ws in list(self.active.get(job_id, [])):
            try:
                await ws.send_json(data)
            except Exception:
                self.active[job_id].discard(ws)


manager = ConnectionManager()


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "device": "cuda" if _cuda_available() else "cpu"}


def _cuda_available():
    try:
        import torch
        return torch.cuda.is_available()
    except Exception:
        return False


@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    """Accept video file, enqueue segmentation task, return job_id."""

    # Validate extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{ext}'. Allowed: {ALLOWED_EXTENSIONS}",
        )

    job_id = str(uuid.uuid4())
    input_path = UPLOAD_DIR / f"{job_id}{ext}"
    output_path = OUTPUT_DIR / f"{job_id}_output.mp4"

    # Stream write to disk
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size_mb:.1f} MB). Max: {MAX_FILE_SIZE_MB} MB",
        )

    with open(input_path, "wb") as f:
        f.write(content)

    logger.info(f"[{job_id}] Uploaded {file.filename} ({size_mb:.1f} MB)")

    # Dispatch Celery task
    task = segment_video_task.apply_async(
        args=[job_id, str(input_path), str(output_path)],
        task_id=job_id,
    )

    return {
        "job_id": job_id,
        "status": "queued",
        "filename": file.filename,
        "size_mb": round(size_mb, 2),
    }


@app.get("/api/status/{job_id}")
async def get_status(job_id: str):
    """Return current job status and progress."""
    result = AsyncResult(job_id, app=celery_app)

    state = result.state  # PENDING / PROGRESS / SUCCESS / FAILURE

    if state == "PENDING":
        return {"job_id": job_id, "status": "queued", "pct": 0.0, "detected": []}

    if state == "PROGRESS":
        meta = result.info or {}
        return {
            "job_id": job_id,
            "status": "processing",
            "pct": meta.get("pct", 0.0),
            "detected": meta.get("detected", []),
        }

    if state == "SUCCESS":
        info = result.result or {}
        return {
            "job_id": job_id,
            "status": "done",
            "pct": 100.0,
            "detected": info.get("detected", []),
        }

    if state == "FAILURE":
        return {
            "job_id": job_id,
            "status": "error",
            "error": str(result.info),
        }

    return {"job_id": job_id, "status": state.lower()}


@app.head("/api/video/{job_id}")
@app.get("/api/video/{job_id}")
async def get_video(job_id: str):
    """Stream the processed video file."""
    output_path = OUTPUT_DIR / f"{job_id}_output.mp4"
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="Result not ready yet")
    return FileResponse(
        str(output_path),
        media_type="video/mp4",
        filename=f"segmented_{job_id}.mp4",
    )


@app.delete("/api/job/{job_id}")
async def delete_job(job_id: str):
    """Cleanup uploaded + output files for a job."""
    for path in UPLOAD_DIR.glob(f"{job_id}*"):
        path.unlink(missing_ok=True)
    for path in OUTPUT_DIR.glob(f"{job_id}*"):
        path.unlink(missing_ok=True)
    return {"job_id": job_id, "status": "deleted"}


# ─── WebSocket: real-time progress ────────────────────────────────────────────

@app.websocket("/ws/{job_id}")
async def websocket_progress(websocket: WebSocket, job_id: str):
    """
    Poll Celery job status and push updates to connected browser.
    Closes automatically when job finishes.
    """
    await manager.connect(job_id, websocket)
    try:
        while True:
            result = AsyncResult(job_id, app=celery_app)
            state = result.state

            if state == "PENDING":
                payload = {"status": "queued", "pct": 0.0, "detected": []}
            elif state == "PROGRESS":
                meta = result.info or {}
                payload = {
                    "status": "processing",
                    "pct": meta.get("pct", 0.0),
                    "detected": meta.get("detected", []),
                }
            elif state == "SUCCESS":
                info = result.result or {}
                payload = {
                    "status": "done",
                    "pct": 100.0,
                    "detected": info.get("detected", []),
                }
                await websocket.send_json(payload)
                break  # close WS on completion
            elif state == "FAILURE":
                payload = {"status": "error", "error": str(result.info)}
                await websocket.send_json(payload)
                break
            else:
                payload = {"status": state.lower(), "pct": 0.0}

            await websocket.send_json(payload)
            await asyncio.sleep(0.8)  # poll every 800ms

    except WebSocketDisconnect:
        logger.info(f"[{job_id}] WebSocket disconnected")
    finally:
        manager.disconnect(job_id, websocket)
