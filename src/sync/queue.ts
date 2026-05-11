import type {
  CardStateMutation,
  CollectionMutation,
  QueuedMutation,
  ReviewMutation,
  SyncMutations,
} from './types'

// ── Validation ───────────────────────────────────────────────────────────
// We round-trip through localStorage so anything could be in there. Validate
// at the boundary and silently drop anything malformed (better than crashing
// the whole sync layer because one entry has drifted from a previous schema).

function isQueuedMutation(v: unknown): v is QueuedMutation {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  if (typeof r.enqueuedAt !== 'number') return false
  switch (r.kind) {
    case 'cardState':
      return typeof r.id === 'string' && 'fsrs' in r
    case 'collection':
      return (
        typeof r.id === 'string' &&
        typeof r.name === 'string' &&
        Array.isArray(r.deckIds) &&
        r.deckIds.every((d) => typeof d === 'string') &&
        typeof r.createdAt === 'number' &&
        typeof r.updatedAt === 'number' &&
        (r.deletedAt === null || typeof r.deletedAt === 'number')
      )
    case 'review':
      return (
        typeof r.cardId === 'string' &&
        typeof r.ratedAt === 'number' &&
        typeof r.rating === 'number'
      )
    default:
      return false
  }
}

export function validateQueue(raw: readonly unknown[]): QueuedMutation[] {
  return raw.filter(isQueuedMutation)
}

// ── Coalescing on enqueue ────────────────────────────────────────────────
// `cardState` and `collection` mutations COALESCE by id — only the latest
// local state needs to be pushed to the server, not the full edit history.
// `review` mutations DO NOT coalesce — each is a distinct historical event.

export function enqueue(
  queue: readonly QueuedMutation[],
  mutation: QueuedMutation,
): QueuedMutation[] {
  if (mutation.kind === 'review') {
    return [...queue, mutation]
  }
  // cardState / collection: drop any prior entry of the same kind+id, then
  // append the new one. Append (rather than replace-in-place) keeps the
  // queue roughly in arrival order for debuggability.
  const filtered = queue.filter((q) => !(q.kind === mutation.kind && q.id === mutation.id))
  return [...filtered, mutation]
}

// ── Snapshot semantics ───────────────────────────────────────────────────
// On flush, the caller takes a snapshot of the queue, sends it to the
// server, and on success removes exactly those entries from the live queue
// (new entries enqueued during the request are preserved).
//
// Identity is by reference within a JS process. Across persistence we
// compare on enqueuedAt + kind + id/cardId — that uniquely identifies an
// entry because (a) cardState/collection coalesce on enqueue so the latest
// stamp wins, and (b) reviews are append-only with a unique ratedAt per
// physical rating event.

function queuedKey(q: QueuedMutation): string {
  if (q.kind === 'cardState' || q.kind === 'collection') return `${q.kind}:${q.id}:${q.enqueuedAt}`
  return `review:${q.cardId}:${q.ratedAt}:${q.enqueuedAt}`
}

export function removeSnapshot(
  current: readonly QueuedMutation[],
  snapshot: readonly QueuedMutation[],
): QueuedMutation[] {
  const keys = new Set(snapshot.map(queuedKey))
  return current.filter((q) => !keys.has(queuedKey(q)))
}

// ── Wire-format conversion ───────────────────────────────────────────────
// Turn a queue snapshot into the `mutations` envelope POST /api/sync expects.

export function snapshotToMutations(snapshot: readonly QueuedMutation[]): SyncMutations {
  const cardStates: CardStateMutation[] = []
  const collections: CollectionMutation[] = []
  const reviews: ReviewMutation[] = []
  for (const q of snapshot) {
    if (q.kind === 'cardState') {
      cardStates.push({ id: q.id, fsrs: q.fsrs })
    } else if (q.kind === 'collection') {
      collections.push({
        id: q.id,
        name: q.name,
        deckIds: q.deckIds,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
        deletedAt: q.deletedAt,
      })
    } else {
      reviews.push({ cardId: q.cardId, ratedAt: q.ratedAt, rating: q.rating })
    }
  }
  return { cardStates, collections, reviews }
}

// Convenience: are there any entries worth pushing?
export function isEmpty(queue: readonly QueuedMutation[]): boolean {
  return queue.length === 0
}
