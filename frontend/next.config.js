/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
  },

  // Docker/HF Spaces: static export served by FastAPI directly on :7860
  ...(process.env.BUILD_EXPORT === '1' ? {
    output: 'export',
    eslint: { ignoreDuringBuilds: true },
    typescript: { ignoreBuildErrors: true },
    images: { unoptimized: true },
  } : {}),

  // Standalone build (not currently used but kept for reference)
  ...(process.env.BUILD_STANDALONE === '1' ? {
    output: 'standalone',
    eslint: { ignoreDuringBuilds: true },
    typescript: { ignoreBuildErrors: true },
  } : {}),
}

module.exports = nextConfig
