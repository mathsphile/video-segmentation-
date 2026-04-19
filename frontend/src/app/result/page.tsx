'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

function ResultContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const jobId        = searchParams?.get('id') ?? ''
  const videoRef     = useRef<HTMLVideoElement>(null)

  const [status,      setStatus]      = useState<'loading' | 'ready' | 'error'>('loading')
  const [videoUrl,    setVideoUrl]    = useState<string | null>(null)
  const [detected,    setDetected]    = useState<string[]>([])
  const [isPlaying,   setIsPlaying]   = useState(false)
  const [copied,      setCopied]      = useState(false)
  const [retries,     setRetries]     = useState(0)

  useEffect(() => {
    if (!jobId) { setStatus('error'); return }

    const checkStatus = async () => {
      try {
        // 1. Check API status
        const res = await fetch(`${API_BASE}/api/status/${jobId}`)
        if (!res.ok) throw new Error('Not found')
        const data = await res.json()

        if (data.status === 'done') {
          setDetected(data.detected || [])
          const url = `${API_BASE}/api/video/${jobId}`
          
          // 2. Verify file exists with HEAD request
          const head = await fetch(url, { method: 'HEAD' })
          if (head.ok) {
            setVideoUrl(url)
            setStatus('ready')
          } else {
            throw new Error('Video file missing')
          }
        } else if (data.status === 'error') {
          setStatus('error')
        } else {
          // Still processing? Wait and retry
          if (retries < 10) {
            setTimeout(() => setRetries(r => r + 1), 2000)
          } else {
            setStatus('error')
          }
        }
      } catch (err) {
        if (retries < 5) {
          setTimeout(() => setRetries(r => r + 1), 2000)
        } else {
          setStatus('error')
        }
      }
    }

    checkStatus()
  }, [jobId, retries])

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
          <a href={videoUrl!} download className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2">
            Download MP4
          </a>
        </div>
      </div>

      <div className="bg-slate-900 rounded-[32px] overflow-hidden shadow-2xl border border-slate-800 relative group aspect-video lg:aspect-auto">
        <video
          ref={videoRef}
          src={videoUrl!}
          className="w-full h-full max-h-[70vh]"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onClick={togglePlay}
        />
        
        <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
           <div className="flex items-center justify-between">
             <button onClick={togglePlay} className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all">
                {isPlaying ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                )}
             </button>
             <div className="px-4 py-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[10px] font-bold text-white uppercase tracking-widest">
               DeepLabV3+ Output
             </div>
           </div>
        </div>
      </div>

      {detected.length > 0 && (
        <div className="mt-12">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
            <span className="h-px bg-slate-100 flex-1" />
            Detected Objects
            <span className="h-px bg-slate-100 flex-1" />
          </h2>
          <div className="flex flex-wrap justify-center gap-2">
            {detected.map(cls => (
              <span key={cls} className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-100 text-sm font-medium text-slate-700 capitalize">
                {cls}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-16 text-center">
        <a href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-orange-500 transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back to upload new video
        </a>
      </div>
    </div>
  )
}

export default function ResultPage() {
  return (
    <Suspense fallback={<div className="p-20 text-center">Loading...</div>}>
      <ResultContent />
    </Suspense>
  )
}
