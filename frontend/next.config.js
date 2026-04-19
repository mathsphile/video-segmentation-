/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
  },

  // Docker/HF Spaces: static export served by FastAPI directly on :7860
  output: 'export',
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },

  // Ensure trailing slashes are consistent for static routing
  // and Next.js generates processing/index.html instead of processing.html
  trailingSlash: true,
}

module.exports = nextConfig
