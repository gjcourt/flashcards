// Extends the web app's vite.config.ts (which is also vitest's config in this
// repo) to constrain test discovery to `src/` and explicitly exclude the
// sync service in `server/`. Without this, root `npm test` auto-discovers
// `server/**/*.test.ts`, whose imports (kysely, pg, hono) aren't installed
// at the root.
//
// vitest 4 picks up `vitest.config.ts` ahead of `vite.config.ts`, so this
// file takes effect without modifying any existing web-app file.

import { defineConfig, mergeConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
      exclude: [...configDefaults.exclude, 'server/**'],
    },
  }),
)
