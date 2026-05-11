import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `base` controls the deployed asset path. The Dockerfile sets `BASE_PATH`
// to `/` for the multi-deck build and `/nato/` for the locked build, so a
// single nginx pod serves both at https://flashcards.<domain>/ and /nato/.
//
// Defaults to `/` for local dev (`npm run dev`).
const base = process.env.BASE_PATH || '/'

// In dev, proxy /api/* to the local sync service so `npm run dev` works
// end-to-end without a separate nginx in front. In production the homelab
// gateway's HTTPRoute routes /api/* to the sync pod (milestone 4) — this
// proxy is dev-only.
const SYNC_DEV_TARGET = process.env.SYNC_DEV_TARGET || 'http://localhost:8080'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: SYNC_DEV_TARGET,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
