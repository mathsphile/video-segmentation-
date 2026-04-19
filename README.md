# SegVision — AI Video Segmentation App

> Upload any video → get real-time semantic segmentation with 21-class PASCAL VOC overlay.  
> Powered by **DeepLabV3 + ResNet-50**, **FastAPI**, **Celery**, **Redis**, and **Next.js 14**.

---

## Architecture

```
┌─────────────────┐      HTTP/WS      ┌──────────────────┐
│  Next.js 14     │◄─────────────────►│  FastAPI         │
│  (port 3000)    │   upload/status   │  (port 8000)     │
│  Dark UI        │   WS progress     │  DeepLabV3 model │
└─────────────────┘                   └────────┬─────────┘
                                               │ Celery tasks
                                    ┌──────────▼─────────┐
                                    │  Redis              │
                                    │  (broker + backend) │
                                    └──────────┬─────────┘
                                               │
                                    ┌──────────▼─────────┐
                                    │  Celery Worker      │
                                    │  (GPU inference)    │
                                    └────────────────────┘
```

---

## Quick Start (Local Dev)

### Prerequisites
- Python 3.10+
- Node.js 18+ (for frontend)
- Redis (or Docker to run Redis)
- Optional: CUDA-capable GPU

### One-command start

```bash
bash start.sh
```

This will:
1. Start Redis (via Docker if not installed locally)
2. Create Python venv + install backend deps
3. Start Celery worker
4. Start FastAPI on `:8000`
5. Start Next.js on `:3000`

Then open **http://localhost:3000** 🎉

---

## Manual Setup

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Terminal 1 — API server
uvicorn main:app --reload --port 8000

# Terminal 2 — Celery worker
celery -A tasks worker --loglevel=info
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Redis (if not installed)

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

---

## Docker (Production)

```bash
docker-compose up --build
```

Services:
| Service | Port | Description |
|---|---|---|
| `frontend` | 3000 | Next.js UI |
| `backend` | 8000 | FastAPI + model |
| `worker` | — | Celery inference worker |
| `redis` | 6379 | Message broker |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload video → returns `job_id` |
| `GET` | `/api/status/{job_id}` | Job progress (0–100%) + detected classes |
| `GET` | `/api/video/{job_id}` | Stream segmented MP4 |
| `DELETE` | `/api/job/{job_id}` | Cleanup files |
| `WS` | `/ws/{job_id}` | Real-time progress stream |
| `GET` | `/api/health` | Health check + device info |
| `GET` | `/docs` | Interactive Swagger UI |

### Upload Response
```json
{
  "job_id": "uuid",
  "status": "queued",
  "filename": "my_video.mp4",
  "size_mb": 12.5
}
```

### Status Response
```json
{
  "job_id": "uuid",
  "status": "processing",
  "pct": 42.7,
  "detected": ["person", "car", "dog"]
}
```

---

## PASCAL VOC Classes (21)

| ID | Class | Colour |
|---|---|---|
| 0 | background | ⬛ black |
| 1 | aeroplane | 🔵 sky blue |
| 2 | bicycle | 🟠 orange |
| 3 | bird | 🟡 gold |
| 4 | boat | 💙 deep sky blue |
| 5 | bottle | 🟣 dark violet |
| 6 | bus | 🩷 deep pink |
| 7 | car | 🔴 crimson |
| 8 | cat | 🟠 dark orange |
| 9 | chair | 🟤 saddle brown |
| 10 | cow | 🟡 yellow |
| 11 | diningtable | 🟤 chocolate |
| 12 | dog | 🟣 medium orchid |
| 13 | horse | 🩷 hot pink |
| 14 | motorbike | 🟢 spring green |
| 15 | person | 🔴 red-orange |
| 16 | potted plant | 🟢 forest green |
| 17 | sheep | 🟡 khaki |
| 18 | sofa | 🩵 dark turquoise |
| 19 | train | 🔵 blue |
| 20 | tv/monitor | 🩵 aquamarine |

---

## Performance Tips

- **GPU**: Set `DEVICE=cuda` — inference is ~10× faster
- **Video length**: Works best on clips ≤ 2 min (longer = queued async)
- **Resolution**: Frames are resized to max 640px — keeps quality + speed balanced
- **Workers**: Increase `--concurrency` in Celery for parallel jobs

---

## Project Structure

```
video-seg-app/
├── backend/
│   ├── inference.py      # DeepLabV3 model + frame segmentation
│   ├── tasks.py          # Celery task (async video processing)
│   ├── main.py           # FastAPI: upload / status / video / WS
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/app/
│   │   ├── page.tsx              # Upload UI (drag & drop)
│   │   ├── processing/[id]/      # Real-time progress page
│   │   └── result/[id]/          # Video player + class legend
│   ├── src/app/globals.css       # Dark mode design system
│   ├── tailwind.config.js
│   └── Dockerfile
├── docker-compose.yml
├── start.sh              # One-command local dev
└── README.md
```
