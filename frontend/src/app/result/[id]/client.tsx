'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

const VOC_COLORS: Record<string, string> = {
  aeroplane:'#87CEEB', bicycle:'#FFA500', bird:'#FFD700', boat:'#00BFFF',
  bottle:'#9400D3', bus:'#FF1493', car:'#DC143C', cat:'#FF8C00',
  chair:'#8B4513', cow:'#D4A017', diningtable:'#D2691E', dog:'#BA55D3',
  horse:'#FF69B4', motorbike:'#22c55e', person:'#FF4500',
  'potted plant':'#228B22', sheep:'#B8A40A', sofa:'#00CED1',
  train:'#3b82f6', 'tv/monitor':'#0D9488',
}

function useScrollReveal(status: string) {
  useEffect(() => {
    if (status !== 'ready') return
    // Small delay to ensure the DOM has fully updated
    const timer = setTimeout(() => {
      const targets = document.querySelectorAll('.scroll-hidden, .scroll-left, .scroll-right, .scroll-scale')
      const obs = new IntersectionObserver(
        entries => entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('scroll-visible')
            obs.unobserve(e.target)
          }
        }),
        { threshold: 0.05 }
      )
      targets.forEach(t => obs.observe(t))
    }, 100)
    return () => clearTimeout(timer)
  }, [status])
}

export default function ResultPage() {
  const params   = useParams()
  const jobId    = params?.id as string
  const videoRef = useRef<HTMLVideoElement>(null)

  // 'loading' → 'ready' or 'error'
  const [status,      setStatus]      = useState<'loading'|'ready'|'error'>('loading')
  const [detected,    setDetected]    = useState<string[]>([])
  const [videoReady,  setVideoReady]  = useState(false)   // video URL responded 200
  const [isPlaying,   setIsPlaying]   = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration,    setDuration]    = useState(0)
  const [volume,      setVolume]      = useState(1)
  const [copied,      setCopied]      = useState(false)
  const [retries,     setRetries]     = useState(0)

  const videoUrl = `${API_BASE}/api/video/${jobId}`

  useScrollReveal(status)

  useEffect(() => {
    if (!jobId) return

    const fetchStatus = async () => {
      try {
        const res  = await fetch(`${API_BASE}/api/status/${jobId}`)
        if (!res.ok) throw new Error()
        const data = await res.json()

        if (data.status === 'done') {
          setDetected(data.detected ?? [])
          setStatus('ready')
          return
        }
        await probeVideo()
      } catch {
        await probeVideo()
      }
    }

    const probeVideo = async () => {
      try {
        // Explicitly use HEAD; backend now supports this
        const res = await fetch(videoUrl, { method: 'HEAD' })
        if (res.ok) {
          setStatus('ready')
        } else if (retries < 6) {
          setTimeout(() => setRetries(r => r + 1), 1500)
        } else {
          setStatus('error')
        }
      } catch {
        setStatus('error')
      }
    }

    fetchStatus()
  }, [jobId, retries, videoUrl])

  const togglePlay = () => {
    const v = videoRef.current; if (!v) return
    if (v.paused) { v.play(); setIsPlaying(true) }
    else          { v.pause(); setIsPlaying(false) }
  }

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (status === 'loading') return (
    <div className="max-w-4xl mx-auto px-5 py-32 text-center">
      <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center mx-auto mb-5">
        <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" strokeWidth="2">
          <defs>
            <linearGradient id="sg-spin" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f97316"/>
              <stop offset="100%" stopColor="#fbbf24"/>
            </linearGradient>
          </defs>
          <path d="M21 12a9 9 0 1 1-6.219-8.56" stroke="url(#sg-spin)"/>
        </svg>
      </div>
      <p className="text-sm font-medium text-slate-600">Loading your result…</p>
      {retries > 0 && (
        <p className="text-xs text-slate-400 mt-2">Connecting… (Attempt {retries})</p>
      )}
    </div>
  )

  if (status === 'error') return (
    <div className="max-w-4xl mx-auto px-5 py-32 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-5">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
      </div>
      <p className="font-semibold text-slate-800 mb-1">Result not available</p>
      <p className="text-sm text-slate-500 mb-6">The job might still be processing or the file has expired.</p>
      <div className="flex items-center justify-center gap-3">
        <button onClick={() => { setStatus('loading'); setRetries(0) }} className="btn-outline px-5 py-2.5 text-sm">Retry</button>
        <a href="/" className="btn-primary px-5 py-2.5 text-sm">New Upload</a>
      </div>
    </div>
  )

  return (
    <div className="bg-white max-w-5xl mx-auto px-5 py-12">
      {/* Header — No animation for immediate layout stability */}
      <div className="flex items-start justify-between mb-10 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-bold text-green-600 uppercase tracking-widest">Segmentation Finished</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Your AI Result</h1>
          <p className="text-sm text-slate-500 mt-1">
            Job ID: <code className="text-orange-500 font-mono">{jobId?.slice(0, 12)}</code>
          </p>
        </div>

        <div className="flex gap-2">
          <button onClick={copyLink} className="btn-outline px-4 py-2.5 text-sm flex items-center gap-2">
            {copied ? 'Link Copied!' : 'Copy Result Link'}
          </button>
          <a href={videoUrl} download className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2">
            Download MP4
          </a>
        </div>
      </div>

      {/* Video Player Card */}
      <div className="card border border-slate-200 overflow-hidden mb-8 scroll-scale">
        <div className="flex border-b border-slate-100 bg-slate-50/50">
          <div className="flex-1 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest border-r border-slate-100">Original</div>
          <div className="flex-1 py-3 text-center text-[10px] font-bold text-orange-500 uppercase tracking-widest">Segmented Overlay</div>
        </div>

        <div className="bg-black relative aspect-video">
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full"
            playsInline
            preload="auto"
            onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setDuration(videoRef.current.duration)
                setVideoReady(true)
              }
            }}
            onEnded={() => setIsPlaying(false)}
            onError={() => setTimeout(() => setRetries(r => r + 1), 2000)}
          />
          {!videoReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>

        <div className="px-6 py-5 bg-slate-50 border-t border-slate-100">
          <div className="flex items-center gap-4 mb-4">
            <span className="text-xs text-slate-400 font-mono w-10">{fmtTime(currentTime)}</span>
            <div className="flex-1 h-1.5 rounded-full bg-slate-200 relative group cursor-pointer">
              <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400" style={{ width: `${(currentTime/duration)*100}%` }} />
              <input
                type="range" min={0} max={duration || 1} step={0.1} value={currentTime}
                onChange={e => {
                  const t = +e.target.value
                  if (videoRef.current) { videoRef.current.currentTime = t; setCurrentTime(t) }
                }}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
              />
            </div>
            <span className="text-xs text-slate-400 font-mono w-10 text-right">{fmtTime(duration)}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={togglePlay} className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center hover:bg-slate-800 transition-all active:scale-95 shadow-lg">
                {isPlaying ? <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
              </button>
              <div className="flex items-center gap-2 group">
                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                </div>
                <input
                  type="range" min={0} max={1} step={0.05} value={volume}
                  onChange={e => {
                    const v = +e.target.value
                    if (videoRef.current) videoRef.current.volume = v
                    setVolume(v)
                  }}
                  className="w-24 h-1.5"
                />
              </div>
            </div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">H.264 High Profile · 30 FPS</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 card p-8 scroll-hidden">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">AI Detections</h3>
            <span className="badge">{detected.length} Objects</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {detected.length > 0 ? detected.map(cls => (
              <span key={cls} className="class-pill">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: VOC_COLORS[cls] ?? '#888' }} />
                {cls}
              </span>
            )) : <span className="text-sm text-slate-400">Processing detailed labels...</span>}
          </div>
        </div>

        <div className="card p-8 bg-slate-900 border-slate-800 text-white scroll-hidden">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <a href="/" className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-medium transition-all">New Segmentation</a>
            <a href={videoUrl} download className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-sm font-bold transition-all shadow-lg shadow-orange-500/20">Save Result</a>
          </div>
        </div>
      </div>
    </div>
  )
}
