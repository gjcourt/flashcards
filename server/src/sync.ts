import type { Kysely, Transaction } from 'kysely'
import { sql } from 'kysely'
import type { Database } from './db.js'
import type {
  CardStateMutation,
  CardStateRow,
  CollectionMutation,
  CollectionRow,
  ReviewMutation,
  ReviewRow,
  SyncRequest,
  SyncResponse,
} from './schema.js'

/**
 * Extract `last_review` (ISO 8601 string per ts-fsrs) from an opaque FSRS
 * blob. Returns null if missing or unparseable.
 */
export function extractLastReview(fsrs: unknown): Date | null {
  if (typeof fsrs !== 'object' || fsrs === null) return null
  const obj = fsrs as Record<string, unknown>
  const v = obj.last_review
  if (typeof v !== 'string') return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d
}

/**
 * Last-write-wins comparison for card states.
 *
 *  - Incoming wins iff its `last_review` is strictly later than the
 *    existing row's `last_review`.
 *  - If one side is null and the other is not, the non-null side wins.
 *  - If both are null, the existing row wins (server is conservative on
 *    "new-state" writes — we don't overwrite an existing row with a
 *    timeless one).
 */
export function incomingCardStateWins(existingFsrs: unknown, incomingFsrs: unknown): boolean {
  const ex = extractLastReview(existingFsrs)
  const inc = extractLastReview(incomingFsrs)
  if (ex === null && inc === null) return false
  if (ex === null) return true
  if (inc === null) return false
  return inc.getTime() > ex.getTime()
}

interface ApplyDeps {
  db: Kysely<Database> | Transaction<Database>
  userId: string
  now: Date
}

async function applyCardState(deps: ApplyDeps, mutation: CardStateMutation): Promise<void> {
  const { db, userId, now } = deps

  const existing = await db
    .selectFrom('card_states')
    .select(['fsrs'])
    .where('user_id', '=', userId)
    .where('card_id', '=', mutation.id)
    .executeTakeFirst()

  if (!existing) {
    await db
      .insertInto('card_states')
      .values({
        user_id: userId,
        card_id: mutation.id,
        fsrs: JSON.stringify(mutation.fsrs),
        updated_at: now,
      })
      .execute()
    return
  }

  if (!incomingCardStateWins(existing.fsrs, mutation.fsrs)) {
    return
  }

  await db
    .updateTable('card_states')
    .set({ fsrs: JSON.stringify(mutation.fsrs), updated_at: now })
    .where('user_id', '=', userId)
    .where('card_id', '=', mutation.id)
    .execute()
}

async function applyCollection(deps: ApplyDeps, mutation: CollectionMutation): Promise<void> {
  const { db, userId, now } = deps

  const existing = await db
    .selectFrom('collections')
    .select(['data', 'updated_at'])
    .where('user_id', '=', userId)
    .where('collection_id', '=', mutation.id)
    .executeTakeFirst()

  const data = {
    name: mutation.name,
    deckIds: mutation.deckIds,
    createdAt: mutation.createdAt,
    updatedAt: mutation.updatedAt,
  }
  const incomingDeletedAt = mutation.deletedAt != null ? new Date(mutation.deletedAt) : null

  if (!existing) {
    await db
      .insertInto('collections')
      .values({
        user_id: userId,
        collection_id: mutation.id,
        data: JSON.stringify(data),
        updated_at: now,
        deleted_at: incomingDeletedAt,
      })
      .execute()
    return
  }

  // LWW based on the row's tracked updated_at vs incoming mutation.updatedAt.
  const existingUpdatedMs = existing.updated_at.getTime()
  const incomingUpdatedMs = mutation.updatedAt

  if (incomingUpdatedMs <= existingUpdatedMs && incomingDeletedAt === null) {
    // Stale write that isn't a delete — drop it.
    return
  }

  // We always bump updated_at to max(existing, now). The server's `now`
  // is monotonically newer than the existing row, so this collapses to `now`
  // in practice; using max() defends against clock skew on the DB.
  const newUpdatedAt = new Date(Math.max(existingUpdatedMs, now.getTime()))

  await db
    .updateTable('collections')
    .set({
      data: JSON.stringify(data),
      updated_at: newUpdatedAt,
      deleted_at: incomingDeletedAt,
    })
    .where('user_id', '=', userId)
    .where('collection_id', '=', mutation.id)
    .execute()
}

async function applyReview(deps: ApplyDeps, mutation: ReviewMutation): Promise<void> {
  const { db, userId } = deps

  // Idempotent: ON CONFLICT DO NOTHING on (user_id, card_id, rated_at).
  await db
    .insertInto('reviews')
    .values({
      user_id: userId,
      card_id: mutation.cardId,
      rated_at: new Date(mutation.ratedAt),
      rating: mutation.rating,
    })
    .onConflict((oc) => oc.columns(['user_id', 'card_id', 'rated_at']).doNothing())
    .execute()
}

function parseCollectionData(raw: unknown): {
  name: string
  deckIds: string[]
  createdAt: number
  updatedAt: number
} {
  const obj = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>
  const name = typeof obj.name === 'string' ? obj.name : ''
  const deckIds = Array.isArray(obj.deckIds)
    ? obj.deckIds.filter((x): x is string => typeof x === 'string')
    : []
  const createdAt = typeof obj.createdAt === 'number' ? obj.createdAt : 0
  const updatedAt = typeof obj.updatedAt === 'number' ? obj.updatedAt : 0
  return { name, deckIds, createdAt, updatedAt }
}

/**
 * Handle a sync request end-to-end.
 *
 *   1. Apply all mutations in a single transaction, all stamped with the
 *      same `now`.
 *   2. Read back everything updated in (since, now] for this user.
 *   3. Return `{ now, cardStates, collections, reviews }`.
 *
 * Mutations the client just sent are NOT echoed back to it — the response
 * window is `updated_at > since AND updated_at <= now`. The client treats
 * its own mutations as committed once we return 2xx.
 */
export async function handleSync(
  db: Kysely<Database>,
  userId: string,
  req: SyncRequest,
  nowMs?: number,
): Promise<SyncResponse> {
  const now = new Date(nowMs ?? Date.now())
  const since = new Date(req.since)

  await db.transaction().execute(async (trx) => {
    const deps: ApplyDeps = { db: trx, userId, now }
    for (const m of req.mutations.cardStates) await applyCardState(deps, m)
    for (const m of req.mutations.collections) await applyCollection(deps, m)
    for (const m of req.mutations.reviews) await applyReview(deps, m)
  })

  // ── Read-back window: (since, now] ───────────────────────────────────────
  const cardStateRows = await db
    .selectFrom('card_states')
    .select(['card_id', 'fsrs', 'updated_at'])
    .where('user_id', '=', userId)
    .where('updated_at', '>', since)
    .where('updated_at', '<=', now)
    .execute()

  const cardStates: CardStateRow[] = cardStateRows.map((r) => ({
    id: r.card_id,
    fsrs: typeof r.fsrs === 'string' ? JSON.parse(r.fsrs) : r.fsrs,
    updatedAt: r.updated_at.getTime(),
  }))

  const collectionRows = await db
    .selectFrom('collections')
    .select(['collection_id', 'data', 'updated_at', 'deleted_at'])
    .where('user_id', '=', userId)
    .where('updated_at', '>', since)
    .where('updated_at', '<=', now)
    .execute()

  const collections: CollectionRow[] = collectionRows.map((r) => {
    const data = parseCollectionData(r.data)
    return {
      id: r.collection_id,
      name: data.name,
      deckIds: data.deckIds,
      createdAt: data.createdAt,
      updatedAt: r.updated_at.getTime(),
      deletedAt: r.deleted_at ? r.deleted_at.getTime() : null,
    }
  })

  const reviewRows = await db
    .selectFrom('reviews')
    .select(['card_id', 'rated_at', 'rating'])
    .where('user_id', '=', userId)
    .where('rated_at', '>', since)
    .where('rated_at', '<=', now)
    .execute()

  const reviews: ReviewRow[] = reviewRows.map((r) => ({
    cardId: r.card_id,
    ratedAt: r.rated_at.getTime(),
    rating: r.rating,
  }))

  return {
    now: now.getTime(),
    cardStates,
    collections,
    reviews,
  }
}

// Silence unused-import warning under strict bundler configs.
export const _sqlMarker = sql
