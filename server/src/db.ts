import { Kysely, PostgresDialect, sql } from 'kysely'
import pg from 'pg'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Schema types (kysely tables) ───────────────────────────────────────────

export interface CardStatesTable {
  user_id: string
  card_id: string
  fsrs: unknown
  updated_at: Date
}

export interface CollectionsTable {
  user_id: string
  collection_id: string
  data: unknown
  updated_at: Date
  deleted_at: Date | null
}

export interface ReviewsTable {
  user_id: string
  card_id: string
  rated_at: Date
  rating: number
}

export interface SchemaMigrationsTable {
  version: string
  applied_at: Date
}

export interface Database {
  card_states: CardStatesTable
  collections: CollectionsTable
  reviews: ReviewsTable
  schema_migrations: SchemaMigrationsTable
}

// ── Connection helpers ─────────────────────────────────────────────────────

export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl })
}

export function createDb(pool: pg.Pool): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  })
}

// ── Migrations ─────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// The migrations directory lives one level above `dist/` (or src/) — at
// server/migrations. Resolve relative to this file so both dev (tsx) and
// production (node dist) work.
function resolveMigrationsDir(override?: string): string {
  if (override) return override
  // src/db.ts  -> ../migrations
  // dist/db.js -> ../migrations
  return join(__dirname, '..', 'migrations')
}

export interface MigrationFile {
  version: string
  filename: string
  sql: string
}

export function loadMigrations(dir?: string): MigrationFile[] {
  const resolved = resolveMigrationsDir(dir)
  const files = readdirSync(resolved)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  return files.map((filename) => {
    const version = filename.replace(/\.sql$/, '')
    const text = readFileSync(join(resolved, filename), 'utf8')
    return { version, filename, sql: text }
  })
}

/**
 * Apply all pending SQL migrations, tracked in `schema_migrations`.
 * Idempotent: applying twice is a no-op.
 */
export async function runMigrations(
  db: Kysely<Database>,
  options: { dir?: string } = {},
): Promise<{ applied: string[] }> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db)

  const migrations = loadMigrations(options.dir)
  const applied: string[] = []

  for (const m of migrations) {
    const existing = await db
      .selectFrom('schema_migrations')
      .select('version')
      .where('version', '=', m.version)
      .executeTakeFirst()
    if (existing) continue

    await db.transaction().execute(async (trx) => {
      await sql.raw(m.sql).execute(trx)
      await trx
        .insertInto('schema_migrations')
        .values({ version: m.version, applied_at: new Date() })
        .execute()
    })
    applied.push(m.version)
  }

  return { applied }
}
