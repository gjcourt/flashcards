// Scope the root vitest run to just the web app's tests under `src/`.
//
// The new sync service in `server/` is a fully isolated Node package with its
// own vitest config — it's covered by the dedicated `Server / Test` CI job.
// Without this workspace file, the root vitest would auto-discover
// `server/**/*.test.ts` and fail at import time (no `server/node_modules`
// hanging off the root install).
//
// Keeping this as a workspace (rather than editing vite.config.ts) preserves
// the web app's existing test entrypoint exactly as it was.
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    extends: './vite.config.ts',
    test: {
      include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
      exclude: ['node_modules', 'dist', 'server', '.worktrees'],
    },
  },
])
