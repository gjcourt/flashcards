import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `base` controls the deployed asset path. The Dockerfile sets `BASE_PATH`
// to `/` for the multi-deck build and `/nato/` for the locked build, so a
// single nginx pod serves both at https://flashcards.<domain>/ and /nato/.
//
// Defaults to `/` for local dev (`npm run dev`).
const base = process.env.BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
