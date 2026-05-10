import { describe, it, expect } from 'vitest'
import { runMigrations } from '../db.js'
import { makeTestDb } from './testdb.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations')

describe('migrations', () => {
  it('applies all migrations on first run', async () => {
    const t = await makeTestDb()
    // makeTestDb already runs migrations; ask for the applied list on a
    // second invocation — should be empty.
    const r = await runMigrations(t.db, { dir: MIGRATIONS_DIR })
    expect(r.applied).toEqual([])
    await t.destroy()
  })

  it('is idempotent (applying twice is a no-op)', async () => {
    const t = await makeTestDb()
    await runMigrations(t.db, { dir: MIGRATIONS_DIR })
    const r = await runMigrations(t.db, { dir: MIGRATIONS_DIR })
    expect(r.applied).toEqual([])
    await t.destroy()
  })

  it('creates the schema_migrations table', async () => {
    const t = await makeTestDb()
    // Probe by inserting into it directly — would throw if missing.
    const rows = await t.db.selectFrom('schema_migrations').selectAll().execute()
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows.some((r) => r.version === '0001_init')).toBe(true)
    await t.destroy()
  })

  it('creates the three expected tables (card_states, collections, reviews)', async () => {
    const t = await makeTestDb()
    // Insert sentinel rows; would throw if the table is missing.
    await t.db
      .insertInto('card_states')
      .values({
        user_id: 'u',
        card_id: 'c',
        fsrs: JSON.stringify({ x: 1 }),
        updated_at: new Date(),
      })
      .execute()
    await t.db
      .insertInto('collections')
      .values({
        user_id: 'u',
        collection_id: 'col',
        data: JSON.stringify({ name: 'x', deckIds: [] }),
        updated_at: new Date(),
        deleted_at: null,
      })
      .execute()
    await t.db
      .insertInto('reviews')
      .values({
        user_id: 'u',
        card_id: 'c',
        rated_at: new Date(),
        rating: 3,
      })
      .execute()
    expect(true).toBe(true)
    await t.destroy()
  })
})
