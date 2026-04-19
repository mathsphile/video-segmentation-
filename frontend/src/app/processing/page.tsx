'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// Determine API_BASE: if the baked-in env var is defined, use it.
const getApiBase = () => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') return ''; // Production same-origin
  return 'http://localhost:8000'; // SSR fallback
};
const API_BASE = getApiBase();

const VOC_COLORS: Record<string, string> = {
  aeroplane:'#87CEEB', bicycle:'#FFA500', bird:'#FFD700', boat:'#00BFFF',
  bottle:'#9400D3', bus:'#FF1493', car:'#DC143C', cat:'#FF8C00',
  chair:'#8B4513', cow:'#D4A017', diningtable:'#D2691E', dog:'#BA55D3',
  horse:'#FF69B4', motorbike:'#22c55e', person:'#FF4500',
  'potted plant':'#228B22', sheep:'#B8A40A', sofa:'#00CED1',
  train:'#3b82f6', 'tv/monitor':'#0D9488',
}

const STEPS = ['Queued', 'Inferring Frames', 'Encoding H.264', 'Complete']

function ProcessingContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const jobId        = searchParams?.get('id') ?? ''
  const cardRef      = useRef<HTMLDivElement>(null)

  const [pct,      setPct]      = useState(0)
  const [status,   setStatus]   = useState('queued')
  const [detected, setDetected] = useState<string[]>([])
  const [error,    setError]    = useState<string | null>(null)
  const [elapsed,  setElapsed]  = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setTimeout(() => cardRef.current?.classList.add('scroll-visible'), 50)
  }, [])

  useEffect(() => {
    if (!jobId) return
    const start = Date.now()
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now()-start)/1000)), 1000)

    const apiOrigin = API_BASE || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : '');
    const wsUrl = jobId ? `${apiOrigin.replace('http','ws')}/ws/${jobId}` : '';
    const ws = wsUrl ? new WebSocket(wsUrl) : null;
    if (!ws) return;

    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data)
      setStatus(data.status)
      if (data.pct !== undefined) setPct(data.pct)
      if (data.detected) setDetected(data.detected)
      if (data.status === 'done') {
        setPct(100); clearInterval(timerRef.current!)
        setTimeout(() => router.push(`/result?id=${jobId}`), 1200)
      }
      if (data.status === 'error') { setError(data.error ?? 'Failed'); clearInterval(timerRef.current!) }
    }
    ws.onerror = () => pollFallback()
    return () => { ws.close(); clearInterval(timerRef.current!) }
  }, [jobId, router])

  const pollFallback = () => {
    const iv = setInterval(async () => {
      try {
        const endpoint = API_BASE ? `${API_BASE}/api/status/${jobId}` : `api/status/${jobId}`
        const d = await fetch(endpoint).then(r=>r.json())
        setStatus(d.status)
        if (d.pct !== undefined) setPct(d.pct)
        if (d.detected) setDetected(d.detected)
        if (d.status === 'done') {
          clearInterval(iv); clearInterval(timerRef.current!)
          setTimeout(() => router.push(`/result?id=${jobId}`), 1200)
        }
        if (d.status === 'error') { setError(d.error); clearInterval(iv) }
      } catch {}
    }, 1200)
  }

  const fmtTime = (s: number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`
  const currentStep = status==='queued' ? 0 : status==='processing' ? 1 : status==='done' ? 3 : 2

  return (
    <div className="max-w-xl mx-auto px-5 py-20">
      <div
        ref={cardRef}
        className="scroll-hidden card p-8 border border-slate-200 shadow-sm"
        style={{ borderRadius: '20px' }}
      >
        <div className="text-center mb-8">
          <div className={`w-20 h-20 rounded-2xl mx-auto mb-5 flex items-center justify-center
            ${status==='done'  ? 'bg-green-50 border border-green-200'
            : status==='error' ? 'bg-red-50 border border-red-200'
            : 'bg-orange-50 border border-orange-200'}`}>
            {status==='done' ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            ) : status==='error' ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            ) : (
              <svg className="animate-spin" width="30" height="30" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <defs>
                  <linearGradient id="spin-g" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f97316"/>
                    <stop offset="100%" stopColor="#fbbf24"/>
                  </linearGradient>
                </defs>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" stroke="url(#spin-g)"/>
              </svg>
            )}
          </div>

          <h1 className="text-xl font-bold text-slate-900 mb-1">
            {status==='queued'     ? 'In Queue'
           : status==='processing' ? 'Segmenting…'
           : status==='done'       ? 'Complete!'
           : status==='error'      ? 'Failed' : status}
          </h1>
          <p className="text-sm text-slate-400">
            Job <code className="text-orange-500 font-mono text-xs">{jobId?.slice(0,8)}…</code>
            {status==='processing' && <span className="ml-2 text-slate-400">· {fmtTime(elapsed)}</span>}
          </p>
        </div>

        {status !== 'error' && (
          <div className="mb-7">
            <div className="flex justify-between text-xs font-medium text-slate-500 mb-2">
              <span>Progress</span>
              <span className={pct>=100 ? 'text-green-600' : 'text-orange-500'}>{pct.toFixed(1)}%</span>
            </div>
            <div className="progress-track h-2">
              <div className="progress-fill h-full" style={{ width:`${pct}%` }} />
            </div>
          </div>
        )}

        {status !== 'error' && (
          <div className="mb-7">
            <div className="flex items-center gap-0">
              {STEPS.map((s, i) => (
                <div key={i} className="flex items-center flex-1">
                  <div className="flex flex-col items-center gap-1">
                    <div className={`step-dot ${i < currentStep ? 'done' : i === currentStep ? 'active' : 'pending'}`}>
                      {i < currentStep
                        ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                        : i+1}
                    </div>
                    <p className={`text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap
                      ${i===currentStep ? 'text-orange-500' : i<currentStep ? 'text-green-600' : 'text-slate-300'}`}>
                      {s}
                    </p>
                  </div>
                  {i < STEPS.length-1 && (
                    <div className={`h-px flex-1 mx-1 mb-4 ${i < currentStep ? 'bg-green-300' : 'bg-slate-200'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm mb-6">
            <strong>Error:</strong> {error}
          </div>
        )}

        {status === 'processing' && (
          <div className="grid grid-cols-3 gap-3 mb-7">
            {[
              { label:'Progress', val:`${pct.toFixed(0)}%`, color:'text-orange-500' },
              { label:'Objects',  val:`${detected.length}`, color:'text-slate-800'  },
              { label:'Elapsed',  val:fmtTime(elapsed),     color:'text-slate-800'  },
            ].map(s => (
              <div key={s.label} className="text-center p-4 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">{s.label}</p>
                <p className={`text-lg font-bold ${s.color}`} style={{fontVariantNumeric:'tabular-nums'}}>{s.val}</p>
              </div>
            ))}
          </div>
        )}

        {status === 'queued' && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-orange-50 border border-orange-100 mb-6">
            <div className="flex gap-1.5">
              <span className="bounce-dot bg-orange-400" />
              <span className="bounce-dot bg-amber-400"  />
              <span className="bounce-dot bg-yellow-400" />
            </div>
            <p className="text-sm text-orange-700">Waiting for a worker to pick up this job…</p>
          </div>
        )}

        {detected.length > 0 && (
          <div className="pt-4 border-t border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
              Detected Objects · {detected.length}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {detected.map(cls => (
                <span key={cls} className="class-pill">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: VOC_COLORS[cls]??'#888' }} />
                  {cls}
                </span>
              ))}
            </div>
          </div>
        )}

        <a href="/" className="mt-8 flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back to upload
        </a>
      </div>
    </div>
  )
}

export default function ProcessingPage() {
  return (
    <Suspense fallback={<div className="p-20 text-center text-slate-400">Loading process…</div>}>
      <ProcessingContent />
    </Suspense>
  )
}
