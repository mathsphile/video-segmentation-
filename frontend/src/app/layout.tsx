import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'SegVision — AI Video Segmentation',
  description:
    'Upload any video and get real-time semantic segmentation with 21-class PASCAL VOC overlay. Powered by DeepLabV3 + ResNet-50.',
  keywords: ['video segmentation', 'AI', 'semantic segmentation', 'DeepLabV3', 'computer vision'],
  openGraph: {
    title: 'SegVision — AI Video Segmentation',
    description: 'Semantic segmentation overlay for any video, in seconds.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
      </head>
      <body className="bg-surface text-white antialiased min-h-screen">
        {/* Ambient background glow */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-brand-600/20 rounded-full blur-3xl animate-pulse-slow" />
          <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1.5s' }} />
        </div>

        {/* Navbar */}
        <nav className="relative z-10 border-b border-surface-border bg-surface/80 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
              </div>
              <span className="text-lg font-bold tracking-tight">
                Seg<span className="text-brand-400">Vision</span>
              </span>
            </a>
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span className="hidden sm:flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                DeepLabV3 · ResNet-50 · PASCAL VOC 21
              </span>
            </div>
          </div>
        </nav>

        <main className="relative z-10">
          {children}
        </main>

        <footer className="relative z-10 border-t border-surface-border mt-20 py-8 text-center text-sm text-gray-500">
          <p>SegVision · Semantic Video Segmentation · DeepLabV3 + ResNet-50</p>
        </footer>
      </body>
    </html>
  )
}
