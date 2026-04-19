'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

const VOC_COLORS: Record<string, string> = {
  aeroplane: '#87CEEB', bicycle: '#FFA500', bird: '#FFD700',
  boat: '#00BFFF', bottle: '#9400D3', bus: '#FF1493',
  car: '#DC143C', cat: '#FF8C00', chair: '#8B4513',
  cow: '#FFFF00', diningtable: '#D2691E', dog: '#BA55D3',
  horse: '#FF69B4', motorbike: '#00FF7F', person: '#FF4500',
  'potted plant': '#228B22', sheep: '#F0E68C', sofa: '#00CED1',
  train: '#0000FF', 'tv/monitor': '#7FFFD4',
}

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  processing: 'Segmenting frames …',
  done: 'Complete!',
  error: 'Error',
}

export default function ProcessingPage() {
  const router = useRouter()
  const params = useParams()
  const jobId = params?.id as string

  const [pct, setPct] = useState(0)
  const [status, setStatus] = useState<string>('queued')
  const [detected, setDetected] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!jobId) return

    // Start elapsed timer
    const startTime = Date.now()
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    // Open WebSocket
    const wsUrl = `${API_BASE.replace('http', 'ws')}/ws/${jobId}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data)
      setStatus(data.status)
      if (data.pct !== undefined) setPct(data.pct)
      if (data.detected) setDetected(data.detected)
      if (data.status === 'done') {
        setPct(100)
        clearInterval(timerRef.current!)
        setTimeout(() => router.push(`/result/${jobId}`), 1200)
      }
      if (data.status === 'error') {
        setError(data.error ?? 'Segmentation failed.')
        clearInterval(timerRef.current!)
      }
    }

    ws.onerror = () => {
      // Fallback: poll via HTTP if WS fails
      pollStatus()
    }

    return () => {
      ws.close()
      clearInterval(timerRef.current!)
    }
  }, [jobId])

  const pollStatus = async () => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/status/${jobId}`)
        const data = await res.json()
        setStatus(data.status)
        if (data.pct !== undefined) setPct(data.pct)
        if (data.detected) setDetected(data.detected)
        if (data.status === 'done') {
          clearInterval(interval)
          clearInterval(timerRef.current!)
          setTimeout(() => router.push(`/result/${jobId}`), 1200)
        }
        if (data.status === 'error') {
          setError(data.error)
          clearInterval(interval)
        }
      } catch (e) {
        // ignore transient errors
      }
    }, 1000)
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="max-w-2xl mx-auto px-4 py-20">
      <div className="glass rounded-2xl p-10 shadow-2xl animate-fade-in">

        {/* Status header */}
        <div className="text-center mb-10">
          <div className={`w-20 h-20 rounded-2xl mx-auto mb-5 flex items-center justify-center
            ${status === 'done' ? 'bg-green-500/15' : status === 'error' ? 'bg-red-500/15' : 'bg-brand-500/15'}`}>
            {status === 'done' ? (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ) : status === 'error' ? (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            ) : (
              <svg className="animate-spin" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            )}
          </div>

          <h1 className="text-2xl font-bold text-white mb-1">
            {STATUS_LABELS[status] ?? status}
          </h1>
          <p className="text-gray-400 text-sm">
            Job ID: <code className="text-brand-400 font-mono">{jobId?.slice(0, 8)}…</code>
            {status === 'processing' && (
              <span className="ml-3 text-gray-500">⏱ {formatTime(elapsed)}</span>
            )}
          </p>
        </div>

        {/* Progress Bar */}
        {status !== 'error' && (
          <div className="mb-8">
            <div className="flex justify-between text-sm font-medium mb-2.5">
              <span className="text-gray-300">Progress</span>
              <span className={`${pct >= 100 ? 'text-green-400' : 'text-brand-400'}`}>{pct.toFixed(1)}%</span>
            </div>
            <div className="progress-track h-3">
              <div className="progress-fill h-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm mb-6">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Detected classes */}
        {detected.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Detected Objects ({detected.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {detected.map((cls) => (
                <span key={cls} className="class-pill">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: VOC_COLORS[cls] ?? '#888' }}
                  />
                  {cls}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Queue state placeholder */}
        {status === 'queued' && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-2.5 h-2.5 bg-brand-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <p className="text-gray-400 text-sm">Waiting for a worker to pick up this job …</p>
          </div>
        )}

        {/* Shimmer stats while processing */}
        {status === 'processing' && (
          <div className="mt-6 grid grid-cols-3 gap-3">
            {['Frames Processed', 'Objects Found', 'Time Elapsed'].map((label, i) => (
              <div key={label} className="stat-card text-center">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="font-bold text-white">
                  {i === 0 ? `${pct.toFixed(0)}%` : i === 1 ? detected.length : formatTime(elapsed)}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Back button */}
        <a
          href="/"
          className="mt-8 flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back to upload
        </a>
      </div>
    </div>
  )
}
