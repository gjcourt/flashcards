import { newDb } from 'pg-mem'
import { Kysely, PostgresDialect } from 'kysely'
import type pg from 'pg'
import type { Database } from '../db.js'
import { runMigrations } from '../db.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations')

/**
 * Spin up an in-memory Postgres (pg-mem) and return a Kysely instance
 * pointed at it. Migrations applied.
 */
export async function makeTestDb(): Promise<{
  db: Kysely<Database>
  destroy: () => Promise<void>
}> {
  const mem = newDb({ noAstCoverageCheck: true })

  // pg-mem provides an adapter compatible with the pg.Pool interface.
  const adapter = mem.adapters.createPg() as { Pool: new () => pg.Pool }
  const pool = new adapter.Pool()

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  })

  await runMigrations(db, { dir: MIGRATIONS_DIR })

  return {
    db,
    destroy: async () => {
      await db.destroy()
    },
  }
}
