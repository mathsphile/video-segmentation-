# ─────────────────────────────────────────────────────────────────────────────
# Hugging Face Spaces — Docker SDK
# Architecture:
#   supervisord manages three processes:
#     - Next.js standalone server on :3000
#     - FastAPI (uvicorn) on :8000
#     - nginx on :7860 (routing frontend + backend)
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build Next.js ──────────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
ENV NEXT_PUBLIC_API_URL=""
ENV BUILD_STANDALONE=1
RUN npm run build

# ── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM python:3.10-slim

# System deps
RUN apt-get update && apt-get install -y \
    ffmpeg libgl1 libglib2.0-0 \
    nginx supervisor curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Python deps ──────────────────────────────────────────────────────────────
RUN pip install --no-cache-dir \
    torch==2.1.2 torchvision==0.16.2 \
    --index-url https://download.pytorch.org/whl/cpu

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

# ── Configs ──────────────────────────────────────────────────────────────────
COPY nginx.conf /etc/nginx/nginx.conf
COPY supervisord.conf /etc/supervisor/conf.d/app.conf

# ── Directories, Permissions & Cleanup ───────────────────────────────────────
# Remove default nginx config to prevent conflicts
RUN rm -f /etc/nginx/sites-enabled/default

# Ensure all runtime directories exist and are writable by any user
RUN mkdir -p /tmp/video_seg/uploads /tmp/video_seg/outputs \
    && mkdir -p /tmp/client_temp /tmp/proxy_temp /tmp/fastcgi_temp /tmp/uwsgi_temp /tmp/scgi_temp \
    && mkdir -p /var/log/supervisor /var/run /var/lib/nginx /var/log/nginx \
    && chmod -R 777 /tmp \
    && chmod -R 777 /var/log/supervisor \
    && chmod -R 777 /var/lib/nginx \
    && chmod -R 777 /var/log/nginx \
    && chmod -R 777 /var/run

# HF Spaces requires port 7860
EXPOSE 7860

CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]
