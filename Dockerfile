# ─────────────────────────────────────────────────────────────────────────────
# Hugging Face Spaces — Docker SDK
# Architecture:
#   supervisord manages two processes:
#     - Next.js standalone server on :3000
#     - FastAPI (uvicorn) on :8000
#   nginx on :7860 routes:
#     /api/* and /ws/* → FastAPI :8000
#     everything else  → Next.js :3000
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build Next.js (standalone output) ─────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
# Empty API URL → all /api/* and /ws/* go through nginx to FastAPI
ENV NEXT_PUBLIC_API_URL=""
# Enable standalone output (required for Docker; skipped in local dev)
ENV BUILD_STANDALONE=1
RUN npm run build

# ── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM python:3.10-slim

# System deps: ffmpeg + OpenCV libs + nginx + supervisor + Node.js runtime
RUN apt-get update && apt-get install -y \
    ffmpeg libgl1 libglib2.0-0 \
    nginx supervisor curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Python: CPU-only torch first (layer cache) ──────────────────────────────
RUN pip install --no-cache-dir \
    torch==2.1.2 torchvision==0.16.2 \
    --index-url https://download.pytorch.org/whl/cpu

# ── Python: app dependencies ────────────────────────────────────────────────
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

# ── Copy app code ────────────────────────────────────────────────────────────
COPY backend/ ./backend/

# ── Copy Next.js standalone build ───────────────────────────────────────────
COPY --from=frontend-builder /build/frontend/.next/standalone ./frontend/
COPY --from=frontend-builder /build/frontend/.next/static     ./frontend/.next/static
COPY --from=frontend-builder /build/frontend/public           ./frontend/public

# ── nginx config ────────────────────────────────────────────────────────────
COPY nginx.conf /etc/nginx/nginx.conf

# ── supervisord config ───────────────────────────────────────────────────────
COPY supervisord.conf /etc/supervisor/conf.d/app.conf

# ── Directories ─────────────────────────────────────────────────────────────
RUN mkdir -p /tmp/video_seg/uploads /tmp/video_seg/outputs \
    && mkdir -p /var/log/supervisor

# HF Spaces requires port 7860
EXPOSE 7860

CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]
