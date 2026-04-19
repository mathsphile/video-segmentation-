# ─────────────────────────────────────────────────────────────────────────────
# Hugging Face Spaces — Docker SDK
# 
# Architecture (simplified — NO nginx, NO Next.js server process):
#   1. Build Next.js as a static export → ./frontend/out/
#   2. FastAPI serves the static files + handles /api/* and /ws/*
#   3. Single process: uvicorn on port 7860
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build Next.js static export ────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
# Empty API URL → NEXT_PUBLIC_API_URL="" means relative /api/* calls
# which FastAPI will handle directly (same-origin)
ENV NEXT_PUBLIC_API_URL=""
# Trigger output: 'export' mode in next.config.js
ENV BUILD_EXPORT=1
RUN npm run build

# ── Stage 2: Runtime (Python only, no nginx, no Node) ───────────────────────
FROM python:3.10-slim

# System deps: ffmpeg + OpenCV
RUN apt-get update && apt-get install -y \
    ffmpeg libgl1 libglib2.0-0 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Python: CPU-only torch ───────────────────────────────────────────────────
RUN pip install --no-cache-dir \
    torch==2.1.2 torchvision==0.16.2 \
    --index-url https://download.pytorch.org/whl/cpu

# ── Python: app dependencies ─────────────────────────────────────────────────
RUN pip install --no-cache-dir \
    "fastapi>=0.110.0" \
    "uvicorn[standard]>=0.29.0" \
    "python-multipart>=0.0.9" \
    "aiofiles>=23.0.0" \
    "opencv-python-headless>=4.9.0" \
    "Pillow>=10.0.0" \
    "numpy>=1.24.0,<2.0" \
    "imageio>=2.33.0" \
    "imageio-ffmpeg>=0.4.9"

# ── Copy backend code ────────────────────────────────────────────────────────
COPY backend/ ./backend/

# ── Copy Next.js static export ───────────────────────────────────────────────
COPY --from=frontend-builder /build/frontend/out ./frontend/out

# ── Storage dirs ─────────────────────────────────────────────────────────────
RUN mkdir -p /tmp/video_seg/uploads /tmp/video_seg/outputs

# HF Spaces requires port 7860
EXPOSE 7860

# Single process: FastAPI serves both the API and the static frontend
CMD ["uvicorn", "backend.app_hf:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1"]
