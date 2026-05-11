import { Hono } from 'hono'
import { sql, type Kysely } from 'kysely'
import { ZodError } from 'zod'
import type { Database } from './db.js'
import type { Env } from './env.js'
import { authMiddleware, getAuth, type AuthVariables } from './auth.js'
import { SyncRequest } from './schema.js'
import { handleSync } from './sync.js'

export interface AppDeps {
  env: Env
  db: Kysely<Database>
}

/**
 * Build the Hono app. Pure factory: no DB pool created here, no env read.
 * Easy to instantiate inside tests with pg-mem.
 */
export function createApp(deps: AppDeps) {
  const { env, db } = deps
  const app = new Hono<{ Variables: AuthVariables }>()

  // ── Health ───────────────────────────────────────────────────────────────
  app.get('/healthz', async (c) => {
    try {
      await sql`SELECT 1`.execute(db)
      return c.text('ok', 200)
    } catch {
      return c.text('db unreachable', 500)
    }
  })

  // ── Sync ─────────────────────────────────────────────────────────────────
  app.use('/api/*', authMiddleware(env))

  app.post('/api/sync', async (c) => {
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      return c.json({ error: 'invalid json' }, 400)
    }

    const parsed = SyncRequest.safeParse(raw)
    if (!parsed.success) {
      return c.json({ error: 'invalid request', details: parsed.error.issues }, 400)
    }

    const { userId } = getAuth(c)

    try {
      const resp = await handleSync(db, userId, parsed.data)
      return c.json(resp, 200)
    } catch (err) {
      if (err instanceof ZodError) {
        return c.json({ error: 'invalid request', details: err.issues }, 400)
      }
      // Terse — no stack trace leakage.

      console.error('sync handler error', err)
      return c.json({ error: 'internal error' }, 500)
    }
  })

  return app
}
