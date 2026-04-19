// Server component — can export generateStaticParams (required for output: 'export')
// The actual UI lives in client.tsx which is a 'use client' component.

import ProcessingClient from './client'

// Return empty array: no paths are pre-rendered at build time.
// The static export still emits processing/[id]/index.html as a shell;
// routing is handled client-side via app_hf.py SPA fallback.
export function generateStaticParams() {
  return []
}

export default function ProcessingPage() {
  return <ProcessingClient />
}
