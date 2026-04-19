'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'

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

export default function ResultPage() {
  const params = useParams()
  const jobId = params?.id as string
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [detected, setDetected] = useState<string[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)

  const videoUrl = `${API_BASE}/api/video/${jobId}`
  const downloadUrl = videoUrl

  useEffect(() => {
    if (!jobId) return
    fetch(`${API_BASE}/api/status/${jobId}`)
      .then(r => r.json())
      .then(data => {
        if (data.status === 'done') {
          setDetected(data.detected || [])
          setStatus('ready')
        } else if (data.status === 'error') {
          setStatus('error')
        }
      })
      .catch(() => setStatus('error'))
  }, [jobId])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setIsPlaying(true) }
    else { v.pause(); setIsPlaying(false) }
  }

  const onTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime)
  }

  const onLoadedMetadata = () => {
    if (videoRef.current) setDuration(videoRef.current.duration)
  }

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value)
    if (videoRef.current) { videoRef.current.currentTime = t; setCurrentTime(t) }
  }

  const changeVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    if (videoRef.current) videoRef.current.volume = v
    setVolume(v)
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  if (status === 'loading') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center animate-fade-in">
        <div className="glass rounded-2xl p-16 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/15 flex items-center justify-center mx-auto mb-5">
            <svg className="animate-spin" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          </div>
          <p className="text-gray-300 text-lg">Loading your result …</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center animate-fade-in">
        <div className="glass rounded-2xl p-16 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-5">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <p className="text-gray-300 text-lg mb-2">Result not available</p>
          <p className="text-gray-500 text-sm mb-6">The job may have failed or the result has expired.</p>
          <a href="/" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium text-sm transition-colors">
            Try again
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 animate-fade-in">

      {/* Success Banner */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-green-400"></span>
            <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">Segmentation Complete</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Your Segmented Video</h1>
          <p className="text-gray-400 text-sm mt-1">
            Job: <code className="font-mono text-brand-400">{jobId?.slice(0, 8)}…</code>
            {detected.length > 0 && ` · ${detected.length} object class${detected.length > 1 ? 'es' : ''} detected`}
          </p>
        </div>
        <a
          href={downloadUrl}
          download={`segmented_${jobId?.slice(0, 8)}.mp4`}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl
            bg-gradient-to-r from-brand-600 to-purple-600
            hover:from-brand-500 hover:to-purple-500
            text-white font-semibold text-sm transition-all
            hover:shadow-lg hover:shadow-brand-500/25 hover:-translate-y-0.5"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download MP4
        </a>
      </div>

      {/* Video Player */}
      <div className="glass rounded-2xl overflow-hidden shadow-2xl mb-6">
        {/* Labels */}
        <div className="flex text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 pt-4 pb-2 border-b border-white/5">
          <span className="w-1/2 text-center">Original</span>
          <span className="w-1/2 text-center text-brand-400">Segmented Overlay</span>
        </div>

        {/* Video */}
        <div className="bg-black relative">
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full max-h-[480px] object-contain"
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={onLoadedMetadata}
            onEnded={() => setIsPlaying(false)}
          />
        </div>

        {/* Custom Controls */}
        <div className="px-5 py-4 bg-surface-card/60 backdrop-blur-sm space-y-3">
          {/* Seek bar */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 font-mono w-10">{formatTime(currentTime)}</span>
            <input
              type="range" min={0} max={duration || 1} step={0.1} value={currentTime}
              onChange={seek}
              className="flex-1 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-brand-500"
            />
            <span className="text-xs text-gray-400 font-mono w-10 text-right">{formatTime(duration)}</span>
          </div>

          {/* Buttons row */}
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-xl bg-brand-500/15 hover:bg-brand-500/25 flex items-center justify-center transition-colors"
            >
              {isPlaying ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#6366f1">
                  <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#6366f1">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
              )}
            </button>

            {/* Volume */}
            <div className="flex items-center gap-2 flex-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                {volume > 0 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>}
                {volume > 0.5 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>}
              </svg>
              <input
                type="range" min={0} max={1} step={0.05} value={volume}
                onChange={changeVolume}
                className="w-20 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-brand-500"
              />
            </div>

            <span className="text-xs text-gray-500">
              Side-by-side: Original | Segmented
            </span>
          </div>
        </div>
      </div>

      {/* Detected Objects */}
      {detected.length > 0 && (
        <div className="glass rounded-2xl p-6 mb-6 shadow-xl">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
            🎯 Detected Object Classes ({detected.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {detected.map((cls) => (
              <span key={cls} className="class-pill text-sm px-3 py-1">
                <span
                  className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: VOC_COLORS[cls] ?? '#888' }}
                />
                {cls}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <a
          href="/"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/10 hover:border-white/20 hover:bg-white/5 text-gray-300 hover:text-white font-medium text-sm transition-all"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Segment Another Video
        </a>
        <a
          href={downloadUrl}
          download
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-brand-500/30 hover:border-brand-500/60 hover:bg-brand-500/5 text-brand-400 font-medium text-sm transition-all"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download Result
        </a>
      </div>
    </div>
  )
}
