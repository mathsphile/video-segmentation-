'use client'

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

const VOC_COLORS: Record<string, string> = {
  background:    '#000000', aeroplane:   '#87CEEB', bicycle:     '#FFA500',
  bird:          '#FFD700', boat:        '#00BFFF', bottle:      '#9400D3',
  bus:           '#FF1493', car:         '#DC143C', cat:         '#FF8C00',
  chair:         '#8B4513', cow:         '#FFFF00', diningtable: '#D2691E',
  dog:           '#BA55D3', horse:       '#FF69B4', motorbike:   '#00FF7F',
  person:        '#FF4500', 'potted plant': '#228B22', sheep:   '#F0E68C',
  sofa:          '#00CED1', train:       '#0000FF', 'tv/monitor': '#7FFFD4',
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function HomePage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validate = (f: File): string | null => {
    const allowed = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska']
    if (!allowed.includes(f.type) && !f.name.match(/\.(mp4|mov|avi|webm|mkv)$/i))
      return 'Only MP4, MOV, AVI, WebM, MKV files are supported.'
    if (f.size > 200 * 1024 * 1024)
      return 'File too large. Maximum size is 200 MB.'
    return null
  }

  const selectFile = useCallback((f: File) => {
    const err = validate(f)
    if (err) { setError(err); return }
    setError(null)
    setFile(f)
    // Create video preview thumbnail
    const url = URL.createObjectURL(f)
    setPreview(url)
  }, [])

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) selectFile(f)
  }, [selectFile])

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) selectFile(f)
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: form })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail ?? 'Upload failed')
      }
      const data = await res.json()
      router.push(`/processing/${data.job_id}`)
    } catch (e: any) {
      setError(e.message ?? 'Upload failed. Is the backend running?')
      setUploading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-16">

      {/* Hero */}
      <div className="text-center mb-14 animate-fade-in">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-brand-500/10 border border-brand-500/20 text-brand-400 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse"></span>
          Powered by DeepLabV3 · ResNet-50 · PASCAL VOC
        </div>
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-5 leading-tight">
          AI Video
          <span className="block bg-gradient-to-r from-brand-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
            Segmentation
          </span>
        </h1>
        <p className="text-lg text-gray-400 max-w-xl mx-auto leading-relaxed">
          Upload any video and watch AI detect and colour every object in real-time.
          Get a side-by-side comparison instantly.
        </p>
      </div>

      {/* Upload Card */}
      <div className="glass rounded-2xl p-8 shadow-2xl animate-slide-up">

        {!file ? (
          /* Drop Zone */
          <div
            className={`drop-zone rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer min-h-[280px] ${dragging ? 'drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-5 transition-all duration-300 ${dragging ? 'bg-brand-500/20 scale-110' : 'bg-brand-500/10'}`}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={dragging ? '#818cf8' : '#6366f1'} strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <p className="text-xl font-semibold text-white mb-2">
              {dragging ? 'Drop it here!' : 'Drop your video here'}
            </p>
            <p className="text-gray-400 text-sm mb-5">or click to browse your files</p>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">MP4</span>
              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">MOV</span>
              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">AVI</span>
              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">WebM</span>
              <span className="text-gray-600">· Max 200 MB</span>
            </div>
          </div>
        ) : (
          /* File Preview */
          <div className="animate-fade-in">
            <div className="video-wrapper mb-5 max-h-64">
              <video src={preview!} muted className="w-full max-h-64" controls />
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-brand-500/15 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-white text-sm truncate max-w-[200px] sm:max-w-sm">{file.name}</p>
                  <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
                </div>
              </div>
              <button
                onClick={() => { setFile(null); setPreview(null); setError(null) }}
                className="text-gray-400 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={onFileChange} />

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="mt-6 w-full py-4 rounded-xl font-semibold text-white text-base transition-all duration-200
            bg-gradient-to-r from-brand-600 to-purple-600
            hover:from-brand-500 hover:to-purple-500
            disabled:opacity-40 disabled:cursor-not-allowed
            hover:shadow-lg hover:shadow-brand-500/25 hover:-translate-y-0.5
            active:translate-y-0 flex items-center justify-center gap-3"
        >
          {uploading ? (
            <>
              <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Uploading …
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Segment Video
            </>
          )}
        </button>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-10 animate-fade-in">
        {[
          { icon: '🎯', title: '21 Object Classes', desc: 'People, cars, animals, furniture & more from PASCAL VOC' },
          { icon: '⚡', title: 'GPU Accelerated', desc: 'CUDA inference for fast frame-by-frame processing' },
          { icon: '🎬', title: 'Side-by-Side View', desc: 'Original vs segmented video with downloadable output' },
        ].map((f) => (
          <div key={f.title} className="stat-card">
            <div className="text-2xl mb-2">{f.icon}</div>
            <h3 className="font-semibold text-white text-sm mb-1">{f.title}</h3>
            <p className="text-xs text-gray-400 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Class palette preview */}
      <div className="mt-10 glass rounded-xl p-6 animate-fade-in">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Detectable Classes</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(VOC_COLORS).filter(([k]) => k !== 'background').map(([cls, hex]) => (
            <span key={cls} className="class-pill">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: hex }} />
              {cls}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
