/** @type {import('next').NextConfig} */
const nextConfig = {
  // Local dev: talks directly to FastAPI on :8000
  // Docker/HF build: NEXT_PUBLIC_API_URL="" — nginx routes /api/* to FastAPI
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000',
  },

  // Standalone output is needed for Docker (HF Spaces).
  // Set BUILD_STANDALONE=1 in Dockerfile; omit for local dev.
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' } : {}),
}

module.exports = nextConfig
