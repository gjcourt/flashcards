import { serve } from '@hono/node-server'
import { parseEnv } from './env.js'
import { createPool, createDb, runMigrations } from './db.js'
import { createApp } from './app.js'

async function main() {
  const env = parseEnv()
  const pool = createPool(env.DATABASE_URL)
  const db = createDb(pool)

  console.log(`[sync] starting (auth=${env.AUTH_MODE}, node_env=${env.NODE_ENV})`)

  const { applied } = await runMigrations(db)
  if (applied.length > 0) {
    console.log(`[sync] applied migrations: ${applied.join(', ')}`)
  }

  const app = createApp({ env, db })

  const server = serve({
    fetch: app.fetch,
    port: env.PORT,
  })

  const shutdown = async (signal: string) => {
    console.log(`[sync] received ${signal}, shutting down`)
    server.close()
    await db.destroy()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  console.log(`[sync] listening on :${env.PORT}`)
}

main().catch((err) => {
  console.error('[sync] fatal startup error', err)
  process.exit(1)
})
