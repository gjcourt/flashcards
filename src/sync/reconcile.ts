import { REVIEW_LOG_CAP, type CardFSRSFields, type CardStateMap } from '../storage'
import type { Collection, ReviewLogEntry } from '../types'
import type { CardStateRow, CollectionRow, ReviewRow, SyncResponse } from './types'

// ── Card-state LWW (symmetric with server/src/sync.ts) ────────────────────

export function extractLastReview(fsrs: unknown): Date | null {
  if (typeof fsrs !== 'object' || fsrs === null) return null
  const obj = fsrs as Record<string, unknown>
  const v = obj.last_review
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : v
  }
  if (typeof v === 'string') {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/**
 * Mirror of `incomingCardStateWins` in server/src/sync.ts.
 *
 *  - Incoming wins iff its `last_review` is strictly later than the existing
 *    row's `last_review`.
 *  - If one side is null and the other is not, the non-null side wins.
 *  - If both are null, the existing row wins (null-tie-prefers-existing).
 */
export function incomingCardStateWins(existingFsrs: unknown, incomingFsrs: unknown): boolean {
  const ex = extractLastReview(existingFsrs)
  const inc = extractLastReview(incomingFsrs)
  if (ex === null && inc === null) return false
  if (ex === null) return true
  if (inc === null) return false
  return inc.getTime() > ex.getTime()
}

// ── Reconcilers (pure) ───────────────────────────────────────────────────

// The wire-format `fsrs` is JSON-serialised — `last_review` and `due` come
// back as strings, not Dates. Storage already handles date revival on load,
// but server-pushed rows arrive raw. Revive them on the way into state so
// the rest of the app can rely on Date-typed fields.
const DATE_KEYS = new Set(['due', 'last_review'])
function reviveFsrsDates(fsrs: unknown): CardFSRSFields {
  if (!fsrs || typeof fsrs !== 'object') return fsrs as CardFSRSFields
  const out: Record<string, unknown> = { ...(fsrs as Record<string, unknown>) }
  for (const k of Object.keys(out)) {
    if (DATE_KEYS.has(k) && typeof out[k] === 'string') {
      const d = new Date(out[k] as string)
      if (!Number.isNaN(d.getTime())) out[k] = d
    }
  }
  return out as CardFSRSFields
}

export function reconcileCardStates(
  current: CardStateMap,
  rows: readonly CardStateRow[],
): CardStateMap {
  let next: CardStateMap | null = null
  for (const row of rows) {
    const existing = current[row.id]
    if (existing && !incomingCardStateWins(existing, row.fsrs)) continue
    next ??= { ...current }
    next[row.id] = reviveFsrsDates(row.fsrs)
  }
  return next ?? current
}

export function reconcileCollections(
  current: readonly Collection[],
  rows: readonly CollectionRow[],
): Collection[] {
  if (rows.length === 0) return current as Collection[]
  const byId = new Map<string, Collection>(current.map((c) => [c.id, c]))
  for (const row of rows) {
    const existing = byId.get(row.id)
    // Fall back through updatedAt → createdAt → 0 so legacy entries (persisted
    // before sync metadata existed) still participate in LWW sensibly.
    const existingUpdated = existing?.updatedAt ?? existing?.createdAt ?? 0
    // LWW on updatedAt, mirroring server `applyCollection`:
    //   - non-delete write with stale `updatedAt` (<= existing) → drop
    //   - any delete (`deletedAt != null`) → apply unconditionally
    // Note: the server bumps its `updated_at` to max(existing, now) on apply,
    // so server-pushed rows arrive with a server-fresh `updatedAt`. Local
    // rows store the user-provided `updatedAt`. The comparison rule is the
    // same on both sides; the *values* differ in source, but that's fine for
    // LWW — what matters is monotonicity of stamps that flow through the
    // server, which is preserved.
    if (existing && row.updatedAt <= existingUpdated && row.deletedAt === null) continue

    if (row.deletedAt !== null) {
      byId.delete(row.id)
      continue
    }
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      deckIds: row.deckIds,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: null,
    })
  }
  // Stable order: existing entries first (in their original order), then any
  // newly-inserted ones from the response. This keeps the user's UI stable
  // across syncs that don't change anything.
  const out: Collection[] = []
  const seen = new Set<string>()
  for (const c of current) {
    const live = byId.get(c.id)
    if (live) {
      out.push(live)
      seen.add(c.id)
    }
  }
  for (const [id, c] of byId) {
    if (!seen.has(id)) out.push(c)
  }
  return out
}

export function reconcileReviews(
  current: readonly ReviewLogEntry[],
  rows: readonly ReviewRow[],
): ReviewLogEntry[] {
  if (rows.length === 0) return current as ReviewLogEntry[]
  // De-dup on (cardId, ratedAt). Existing entries win on tie (skip incoming).
  const seen = new Set<string>()
  for (const r of current) seen.add(`${r.cardId}:${r.ratedAt}`)
  const additions: ReviewLogEntry[] = []
  for (const row of rows) {
    const key = `${row.cardId}:${row.ratedAt}`
    if (seen.has(key)) continue
    seen.add(key)
    additions.push({ cardId: row.cardId, ratedAt: row.ratedAt, rating: row.rating })
  }
  if (additions.length === 0) return current as ReviewLogEntry[]
  // Maintain ratedAt-ascending order (matches the local convention where
  // entries are appended chronologically) by merging.
  const merged = [...current, ...additions].sort((a, b) => a.ratedAt - b.ratedAt)
  if (merged.length > REVIEW_LOG_CAP) merged.splice(0, merged.length - REVIEW_LOG_CAP)
  return merged
}

// Top-level reconcile: apply a SyncResponse to a state slice. Returns a new
// object if anything changed, or the same references when nothing did.
export type ReconcileInput = {
  cardStates: CardStateMap
  collections: Collection[]
  reviews: ReviewLogEntry[]
}

export function reconcile(input: ReconcileInput, response: SyncResponse): ReconcileInput {
  return {
    cardStates: reconcileCardStates(input.cardStates, response.cardStates),
    collections: reconcileCollections(input.collections, response.collections),
    reviews: reconcileReviews(input.reviews, response.reviews),
  }
}
