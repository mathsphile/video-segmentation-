#!/usr/bin/env bash
# start.sh — Start the SegVision stack locally
# Run from: video-seg-app/ directory
# Usage: bash start.sh

set -e
CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
PIDS=()

# ── Detect Python / pip (Anaconda preferred) ────────────────────────────────
PYTHON=""
UVICORN=""
CELERY=""
for candidate in /opt/anaconda3/bin/python3 /opt/homebrew/bin/python3 python3 python; do
    if command -v "$candidate" &>/dev/null 2>&1; then
        PYTHON=$(command -v "$candidate")
        break
    fi
done
for candidate in /opt/anaconda3/bin/uvicorn /opt/homebrew/bin/uvicorn "$HOME/Library/Python/3.9/bin/uvicorn" uvicorn; do
    if [ -x "$candidate" ]; then UVICORN="$candidate"; break; fi
done
for candidate in /opt/anaconda3/bin/celery /opt/homebrew/bin/celery "$HOME/Library/Python/3.9/bin/celery" celery; do
    if [ -x "$candidate" ]; then CELERY="$candidate"; break; fi
done

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  SegVision — AI Video Segmentation${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Python : ${GREEN}$PYTHON${NC}"
echo -e "  Uvicorn: ${GREEN}${UVICORN:-NOT FOUND}${NC}"
echo -e "  Celery : ${GREEN}${CELERY:-NOT FOUND}${NC}"
echo ""

if [ -z "$UVICORN" ]; then
    echo -e "${RED}[ERROR]${NC} uvicorn not found. Run:"
    echo -e "  /opt/anaconda3/bin/pip install fastapi 'uvicorn[standard]' 'celery[redis]' redis python-multipart opencv-python-headless"
    exit 1
fi

cleanup() {
    echo -e "\n${YELLOW}Shutting down all services …${NC}"
    for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
    # Also clean up any stray processes
    pkill -f "celery -A tasks" 2>/dev/null || true
    pkill -f "uvicorn main:app" 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# ── Kill any stale processes from previous runs ───────────────────────────────
echo -e "${YELLOW}Stopping any existing services …${NC}"
pkill -f "celery -A tasks" 2>/dev/null && echo "  Stopped old Celery worker" || true
pkill -f "uvicorn main:app" 2>/dev/null && echo "  Stopped old Uvicorn server" || true
sleep 1

# ── 1. Redis ─────────────────────────────────────────────────────────────────
echo -e "${GREEN}[1/4]${NC} Checking Redis …"
if redis-cli ping &>/dev/null 2>&1; then
    echo "  ✓ Redis already running on :6379"
else
    # Try docker (Desktop app path first, then PATH)
    DOCKER_BIN=$(command -v docker 2>/dev/null || ls /Applications/Docker.app/Contents/Resources/bin/docker 2>/dev/null || echo "")
    if [ -n "$DOCKER_BIN" ]; then
        "$DOCKER_BIN" run -d --rm --name seg_redis -p 6379:6379 redis:7-alpine &>/dev/null || \
        "$DOCKER_BIN" start seg_redis &>/dev/null || true
        sleep 2
        echo "  ✓ Redis started via Docker"
    else
        echo -e "  ${RED}[ERROR]${NC} Redis not found. Start Docker Desktop or run: brew install redis && redis-server"
        exit 1
    fi
fi

# ── 2. Celery Worker ─────────────────────────────────────────────────────────
echo -e "${GREEN}[2/4]${NC} Starting Celery worker (updated code) …"
cd "$BACKEND_DIR"
CELERY_LOG="/tmp/celery_worker.log"
"$CELERY" -A tasks worker --loglevel=info --concurrency=1 > "$CELERY_LOG" 2>&1 &
CELERY_PID=$!
PIDS+=($CELERY_PID)
sleep 2
if kill -0 $CELERY_PID 2>/dev/null; then
    echo "  ✓ Worker PID=$CELERY_PID (logs: $CELERY_LOG)"
else
    echo -e "  ${RED}[ERROR]${NC} Celery failed to start. Check: tail $CELERY_LOG"
    exit 1
fi

# ── 3. FastAPI Server ─────────────────────────────────────────────────────────
echo -e "${GREEN}[3/4]${NC} Starting FastAPI on :8000 (with hot-reload) …"
"$UVICORN" main:app --host 0.0.0.0 --port 8000 --reload &
FASTAPI_PID=$!
PIDS+=($FASTAPI_PID)
echo "  ✓ Backend PID=$FASTAPI_PID"
echo "  ⚠️  Note: FastAPI hot-reloads on code save, but Celery does NOT."
echo "     Restart this script after changing inference.py or tasks.py"

# ── 4. Frontend ───────────────────────────────────────────────────────────────
cd "$FRONTEND_DIR"
# Load nvm if available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
NPM_BIN=$(command -v npm 2>/dev/null || echo "")

if [ -n "$NPM_BIN" ]; then
    echo -e "${GREEN}[4/4]${NC} Starting Next.js on :3000 …"
    [ ! -d "node_modules" ] && "$NPM_BIN" install --silent
    "$NPM_BIN" run dev &
    PIDS+=($!)
    echo "  ✓ Frontend PID=$!"
    FRONTEND_URL="http://localhost:3000"
else
    echo -e "${YELLOW}[4/4]${NC} npm not found — skipping Next.js"
    echo "     Install Node.js: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
    echo "     Then: export NVM_DIR=~/.nvm && . \$NVM_DIR/nvm.sh && nvm install 20"
    FRONTEND_URL="N/A (install Node.js)"
fi

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  🎬 Frontend : ${GREEN}${FRONTEND_URL}${NC}"
echo -e "  ⚡ Backend  : ${GREEN}http://localhost:8000${NC}"
echo -e "  📄 API Docs : ${GREEN}http://localhost:8000/docs${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop all services"
echo ""

wait
