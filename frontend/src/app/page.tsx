'use client'

import { useState, useRef, useCallback, useEffect, DragEvent } from 'react'
import { useRouter } from 'next/navigation'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

const VOC_CLASSES = [
  { name: 'aeroplane', color: '#87CEEB' }, { name: 'bicycle', color: '#FFA500' },
  { name: 'bird', color: '#FFD700' },      { name: 'boat', color: '#00BFFF' },
  { name: 'bottle', color: '#9400D3' },    { name: 'bus', color: '#FF1493' },
  { name: 'car', color: '#DC143C' },       { name: 'cat', color: '#FF8C00' },
  { name: 'chair', color: '#8B4513' },     { name: 'cow', color: '#D4A017' },
  { name: 'diningtable', color: '#D2691E' },{ name: 'dog', color: '#BA55D3' },
  { name: 'horse', color: '#FF69B4' },     { name: 'motorbike', color: '#22c55e' },
  { name: 'person', color: '#FF4500' },    { name: 'potted plant', color: '#228B22' },
  { name: 'sheep', color: '#B8A40A' },     { name: 'sofa', color: '#00CED1' },
  { name: 'train', color: '#3b82f6' },     { name: 'tv/monitor', color: '#0D9488' },
]

const STEPS = [
  { num: '01', title: 'Upload', desc: 'Drag & drop or select your video file' },
  { num: '02', title: 'Process', desc: 'AI segments every frame with DeepLabV3' },
  { num: '03', title: 'Download', desc: 'Get H.264 side-by-side comparison MP4' },
]

const FEATURES = [
  {
    icon: '🎯',
    title: '21 Object Classes',
    desc: 'Identifies people, cars, animals, furniture & more using PASCAL VOC labels.',
    tag: 'PASCAL VOC'
  },
  {
    icon: '⚡',
    title: 'GPU Accelerated',
    desc: 'CUDA-powered inference for real-time frame-by-frame segmentation.',
    tag: 'PyTorch'
  },
  {
    icon: '🎬',
    title: 'Side-by-Side Output',
    desc: 'Original and segmented frames combined into one comparison video.',
    tag: 'H.264 MP4'
  },
  {
    icon: '📡',
    title: 'Live Progress',
    desc: 'Real-time WebSocket updates showing segmentation progress as it runs.',
    tag: 'WebSocket'
  },
]

const formatBytes = (b: number) => b < 1024*1024
  ? `${(b/1024).toFixed(1)} KB`
  : `${(b/(1024*1024)).toFixed(1)} MB`

/* ── Scroll animation hook ──────────────────────────────────────────────────── */
function useScrollReveal() {
  useEffect(() => {
    const targets = document.querySelectorAll('.scroll-hidden, .scroll-left, .scroll-right, .scroll-scale')
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('scroll-visible')
          observer.unobserve(e.target)
        }
      }),
      { threshold: 0.12 }
    )
    targets.forEach(t => observer.observe(t))
    return () => observer.disconnect()
  }, [])
}

export default function HomePage() {
  const router   = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [dragging,  setDragging]  = useState(false)
  const [file,      setFile]      = useState<File | null>(null)
  const [preview,   setPreview]   = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  useScrollReveal()

  const validate = (f: File) => {
    if (!f.name.match(/\.(mp4|mov|avi|webm|mkv)$/i)) return 'Only MP4, MOV, AVI, WebM, MKV supported.'
    if (f.size > 200 * 1024 * 1024) return 'File too large. Max 200 MB.'
    return null
  }

  const selectFile = useCallback((f: File) => {
    const err = validate(f); if (err) { setError(err); return }
    setError(null); setFile(f); setPreview(URL.createObjectURL(f))
  }, [])

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]; if (f) selectFile(f)
  }, [selectFile])

  const handleUpload = async () => {
    if (!file) return
    setUploading(true); setError(null)
    try {
      const form = new FormData(); form.append('file', file)
      const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: form })
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail ?? 'Upload failed') }
      const data = await res.json()
      router.push(`/processing?id=${data.job_id}`)
    } catch (e: any) {
      setError(e.message ?? 'Upload failed. Is the backend running?')
      setUploading(false)
    }
  }

  return (
    <div className="bg-white">

      {/* ── Hero ───────────────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 pt-24 pb-16 text-center">
        {/* Badge — animates immediately */}
        <div
          className="badge mx-auto mb-8 w-fit"
          style={{ animation: 'word-in 0.5s ease forwards' }}
        >
          <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse inline-block" />
          DeepLabV3 · ResNet-50 · PASCAL VOC 21 Classes
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-7xl font-black tracking-tight leading-[1.05] mb-6">
          {'AI Video'.split('').map((c,i) => (
            <span key={i} className="word-animate inline-block" style={{ animationDelay: `${i * 0.04}s` }}>
              {c === ' ' ? '\u00a0' : c}
            </span>
          ))}
          <br />
          <span className="text-gradient">Segmentation</span>
        </h1>

        <p
          className="text-lg text-slate-500 max-w-xl mx-auto leading-relaxed mb-10"
          style={{ animation: 'word-in 0.6s 0.4s ease forwards', opacity: 0 }}
        >
          Upload any video and watch AI identify, colour, and label
          every object in real-time — delivered as a stunning side-by-side comparison.
        </p>

        {/* CTA scroll hint */}
        <div style={{ animation: 'word-in 0.5s 0.7s ease forwards', opacity: 0 }}>
          <a
            href="#upload"
            className="btn-primary inline-flex items-center gap-2 px-7 py-3.5 text-sm"
            onClick={e => { e.preventDefault(); document.getElementById('upload')?.scrollIntoView({ behavior:'smooth' }) }}
          >
            Start Segmenting
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
            </svg>
          </a>
        </div>
      </section>

      {/* ── How it Works ──────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 py-16">
        <div className="divider mb-16" />
        <h2 className="text-2xl font-bold text-center text-slate-900 mb-12 scroll-hidden">
          How it works
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-slate-100 rounded-2xl overflow-hidden border border-slate-100">
          {STEPS.map((step, i) => (
            <div
              key={i}
              className={`bg-white p-8 scroll-hidden delay-${i+1} hover:bg-orange-50 transition-colors duration-300`}
            >
              <div className="text-4xl font-black text-gradient mb-4">{step.num}</div>
              <h3 className="text-base font-bold text-slate-900 mb-2">{step.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Upload Card ───────────────────────────────────────────────────────── */}
      <section id="upload" className="max-w-2xl mx-auto px-5 py-8">
        <h2 className="text-xl font-bold text-slate-900 text-center mb-8 scroll-hidden">
          Upload your video
        </h2>

        {/* Moving border card — clean white */}
        <div className="moving-border-card p-1 scroll-scale">
          <div className="bg-white rounded-[15px] p-6">

            {!file ? (
              <div
                className={`drop-zone p-12 flex flex-col items-center ${dragging ? 'drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                {/* Upload icon */}
                <div className={`w-16 h-16 rounded-2xl border-2 ${dragging ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-slate-50'} flex items-center justify-center mb-5 transition-all duration-300 ${dragging ? 'scale-110' : ''}`}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={dragging ? '#f97316' : '#94a3b8'} strokeWidth="2" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>

                <p className="text-base font-semibold text-slate-800 mb-1">
                  {dragging ? 'Drop to upload' : 'Drop video here'}
                </p>
                <p className="text-sm text-slate-400 mb-5">or click to browse · Max 200 MB</p>

                <div className="flex flex-wrap justify-center gap-2">
                  {['MP4', 'MOV', 'AVI', 'WebM', 'MKV'].map(f => (
                    <span key={f} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 text-xs font-mono border border-slate-200">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="rounded-xl overflow-hidden border border-slate-200 mb-4 max-h-60 bg-black">
                  <video src={preview!} muted controls className="w-full max-h-60" />
                </div>
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800 truncate max-w-[200px] sm:max-w-xs">{file.name}</p>
                      <p className="text-xs text-slate-400">{formatBytes(file.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setFile(null); setPreview(null); setError(null) }}
                    className="w-8 h-8 rounded-lg border border-slate-200 hover:border-red-200 hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition-all"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="video/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) selectFile(f) }} />

            {error && (
              <div className="mt-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm flex items-center gap-2">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/>
                </svg>
                {error}
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="btn-primary mt-4 w-full py-3.5 text-sm flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Uploading & queuing…
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                  Segment This Video
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* ── Feature Cards ─────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 py-16">
        <div className="divider mb-16" />
        <div className="flex items-center justify-between mb-10">
          <h2 className="text-2xl font-bold text-slate-900 scroll-left">Features</h2>
          <span className="badge scroll-right">PyTorch · FastAPI · Next.js</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f, i) => (
            <div key={f.title} className={`stat-card scroll-hidden delay-${i+1}`}>
              <div className="text-2xl mb-3">{f.icon}</div>
              <div className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-2">{f.tag}</div>
              <h3 className="text-sm font-bold text-slate-800 mb-2">{f.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Class Palette ─────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 pb-20">
        <div className="divider mb-16" />
        <div className="flex items-center justify-between mb-6 scroll-hidden">
          <h2 className="text-2xl font-bold text-slate-900">Detectable Objects</h2>
          <span className="text-sm text-slate-400 font-mono">{VOC_CLASSES.length} classes</span>
        </div>
        <div className="flex flex-wrap gap-2 scroll-hidden delay-1">
          {VOC_CLASSES.map((c) => (
            <span key={c.name} className="class-pill">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
              {c.name}
            </span>
          ))}
        </div>
      </section>

    </div>
  )
}
