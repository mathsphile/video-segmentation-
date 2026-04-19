"""
app_hf.py — Simplified FastAPI backend for Hugging Face Spaces.

Differences from main.py:
  - No Celery / Redis required.
  - In-memory job registry (jobs dict).
  - ThreadPoolExecutor runs inference in background thread.
  - Serves Next.js static export from ../frontend/out/ on all non-API routes.
"""

import os
import uuid
import asyncio
import logging
import sys
import os
from pathlib import Path
# Add current directory to path so relative imports work without package structure
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from inference import process_video, get_model, VOC_CLASSES

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─── Paths ────────────────────────────────────────────────────────────────────

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/tmp/video_seg/uploads"))
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "/tmp/video_seg/outputs"))
# In Docker: /app/backend/../frontend/out = /app/frontend/out
STATIC_DIR = Path(__file__).parent.parent / "frontend" / "out"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
MAX_FILE_SIZE_MB   = int(os.getenv("MAX_FILE_SIZE_MB", "200"))

# ─── In-memory job registry ───────────────────────────────────────────────────

jobs: Dict[str, Dict[str, Any]] = {}
executor = ThreadPoolExecutor(max_workers=2)

# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(title="SegVision HF API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    logger.info("Loading segmentation model…")
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(executor, get_model)
    logger.info("Model ready.")


# ─── Background inference runner ─────────────────────────────────────────────

def _run_inference(job_id: str, input_path: str, output_path: str):
    """Run video segmentation synchronously (called in thread pool)."""
    jobs[job_id]["status"] = "processing"

    def on_progress(pct: float, detected_names: list):
        jobs[job_id].update({"pct": pct, "detected": detected_names})

    try:
        detected_ids = process_video(
            input_path, output_path, progress_callback=on_progress
        )
        detected_names = [
            VOC_CLASSES[c] for c in sorted(detected_ids) if c < len(VOC_CLASSES)
        ]
        jobs[job_id].update({
            "status":   "done",
            "pct":      100.0,
            "detected": detected_names,
        })
        logger.info(f"[{job_id}] Done — detected: {detected_names}")
    except Exception as exc:
        logger.exception(f"[{job_id}] Inference failed")
        jobs[job_id].update({"status": "error", "error": str(exc)})


# ─── API Endpoints ────────────────────────────────────────────────────────────

@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    ext = Path(file.filename or "x.mp4").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported format '{ext}'.")

    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(413, f"File too large ({size_mb:.1f} MB). Max {MAX_FILE_SIZE_MB} MB.")

    job_id      = str(uuid.uuid4())
    input_path  = UPLOAD_DIR / f"{job_id}{ext}"
    output_path = OUTPUT_DIR / f"{job_id}_output.mp4"

    with open(input_path, "wb") as f:
        f.write(content)

    jobs[job_id] = {"status": "queued", "pct": 0.0, "detected": []}

    loop = asyncio.get_event_loop()
    loop.run_in_executor(executor, _run_inference, job_id, str(input_path), str(output_path))

    logger.info(f"[{job_id}] Queued: {file.filename} ({size_mb:.1f} MB)")
    return {"job_id": job_id, "status": "queued"}


@app.get("/api/status/{job_id}")
async def get_status(job_id: str):
    if job_id in jobs:
        return {"job_id": job_id, **jobs[job_id]}

    # Fallback: check if the output file exists (handles server restart)
    out = OUTPUT_DIR / f"{job_id}_output.mp4"
    if out.exists():
        return {"job_id": job_id, "status": "done", "pct": 100.0, "detected": []}

    raise HTTPException(404, "Job not found")


@app.head("/api/video/{job_id}")
@app.get("/api/video/{job_id}")
async def get_video(job_id: str):
    output_path = OUTPUT_DIR / f"{job_id}_output.mp4"
    if not output_path.exists():
        raise HTTPException(404, "Result not ready yet")
    return FileResponse(
        str(output_path),
        media_type="video/mp4",
        filename=f"segmented_{job_id[:8]}.mp4",
    )


@app.delete("/api/job/{job_id}")
async def delete_job(job_id: str):
    jobs.pop(job_id, None)
    for path in UPLOAD_DIR.glob(f"{job_id}*"):
        path.unlink(missing_ok=True)
    for path in OUTPUT_DIR.glob(f"{job_id}*"):
        path.unlink(missing_ok=True)
    return {"job_id": job_id, "status": "deleted"}


@app.get("/api/health")
async def health():
    import torch
    return {"status": "ok", "device": "cuda" if torch.cuda.is_available() else "cpu"}


# ─── WebSocket progress ───────────────────────────────────────────────────────

@app.websocket("/ws/{job_id}")
async def websocket_progress(ws: WebSocket, job_id: str):
    await ws.accept()
    try:
        while True:
            if job_id in jobs:
                job = jobs[job_id]
                await ws.send_json({"job_id": job_id, **job})
                if job["status"] in ("done", "error"):
                    break
            else:
                out = OUTPUT_DIR / f"{job_id}_output.mp4"
                if out.exists():
                    await ws.send_json({"status": "done", "pct": 100.0, "detected": []})
                    break
                await ws.send_json({"status": "queued", "pct": 0.0, "detected": []})
            await asyncio.sleep(0.8)
    except WebSocketDisconnect:
        pass


# ─── Serve Next.js static export ─────────────────────────────────────────────

if STATIC_DIR.exists():
    # Serve Next.js _next/ assets (JS, CSS, images)
    _next_dir = STATIC_DIR / "_next"
    if _next_dir.exists():
        app.mount("/_next", StaticFiles(directory=str(_next_dir)), name="nextjs-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """
        SPA catch-all: try to serve the exact static file, then .html,
        then index.html in the folder (trailingSlash support).
        """
        # Handle root specially
        if not full_path or full_path == "/":
            index = STATIC_DIR / "index.html"
            if index.is_file(): return FileResponse(str(index))
            return JSONResponse({"error": "frontend index.html not found"}, status_code=404)

        # 1. Exact file match (images, JS, CSS)
        candidate = STATIC_DIR / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))

        # 2. Next.js route: try path.html (e.g., /upload -> upload.html)
        html_candidate = STATIC_DIR / f"{full_path}.html"
        if html_candidate.is_file():
            return FileResponse(str(html_candidate))

        # 3. Next.js route with trailingSlash: path/index.html
        # (e.g., /processing/ -> processing/index.html)
        index_candidate = STATIC_DIR / full_path / "index.html"
        if index_candidate.is_file():
            return FileResponse(str(index_candidate))

        # Final fallback: root index.html (client-side routing)
        index = STATIC_DIR / "index.html"
        if index.is_file():
            return FileResponse(str(index))

        raise HTTPException(404, "Not found")
else:
    @app.get("/")
    async def root():
        return {"message": "SegVision API is running. Frontend not found — build it first."}
