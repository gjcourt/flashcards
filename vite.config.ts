import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `base` controls the deployed asset path. The GitHub Pages workflow sets
// `BASE_PATH` to `/flashcards/` for the multi-deck build and
// `/flashcards/nato/` for the locked build, so the same code can ship at
// two different subpaths on the same Pages site.
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
