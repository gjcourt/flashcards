import { describe, it, expect } from 'vitest'
import { enqueue, isEmpty, removeSnapshot, snapshotToMutations, validateQueue } from './queue'
import type { QueuedMutation } from './types'

const cardState = (id: string, t: number, last: string | null = null): QueuedMutation => ({
  kind: 'cardState',
  id,
  fsrs: { last_review: last, reps: 1 },
  enqueuedAt: t,
})

const collection = (id: string, t: number, deletedAt: number | null = null): QueuedMutation => ({
  kind: 'collection',
  id,
  name: id,
  deckIds: ['nato'],
  createdAt: t - 1000,
  updatedAt: t,
  deletedAt,
  enqueuedAt: t,
})

const review = (cardId: string, ratedAt: number, t: number): QueuedMutation => ({
  kind: 'review',
  cardId,
  ratedAt,
  rating: 3,
  enqueuedAt: t,
})

describe('enqueue — coalescing', () => {
  it('coalesces cardState mutations by id (latest wins)', () => {
    const q1 = enqueue([], cardState('a', 1, '2026-01-01T00:00:00Z'))
    const q2 = enqueue(q1, cardState('a', 2, '2026-01-02T00:00:00Z'))
    expect(q2).toHaveLength(1)
    expect(q2[0]).toMatchObject({ kind: 'cardState', id: 'a', enqueuedAt: 2 })
  })

  it('coalesces collection mutations by id (latest wins, even across delete)', () => {
    const q1 = enqueue([], collection('iv', 1))
    const q2 = enqueue(q1, collection('iv', 2, 2)) // delete
    expect(q2).toHaveLength(1)
    expect(q2[0]).toMatchObject({ kind: 'collection', id: 'iv', deletedAt: 2 })
  })

  it('does NOT coalesce cardState with collection of same id', () => {
    const q = enqueue(enqueue([], cardState('x', 1)), collection('x', 2))
    expect(q).toHaveLength(2)
  })

  it('keeps every review mutation (no coalescing, append-only)', () => {
    let q: QueuedMutation[] = []
    q = enqueue(q, review('a', 100, 1))
    q = enqueue(q, review('a', 200, 2))
    q = enqueue(q, review('a', 300, 3))
    expect(q).toHaveLength(3)
  })
})

describe('removeSnapshot', () => {
  it('removes exactly the entries that were in the snapshot, preserving new ones', () => {
    const snapshot = [cardState('a', 1), review('a', 100, 2)]
    // After "POSTing" the snapshot, a new mutation arrived:
    const live = [...snapshot, review('b', 200, 3)]
    const cleared = removeSnapshot(live, snapshot)
    expect(cleared).toHaveLength(1)
    expect(cleared[0]).toMatchObject({ kind: 'review', cardId: 'b' })
  })

  it('matches identity by kind+id+enqueuedAt — coalesced replacements are not removed', () => {
    // Snapshot captures the v1 mutation; during the in-flight POST, the
    // user re-rated the card, replacing v1 with v2. removeSnapshot must NOT
    // remove v2 because its enqueuedAt differs.
    const v1 = cardState('a', 1)
    const v2 = cardState('a', 5)
    const snapshot = [v1]
    const live = [v2]
    const cleared = removeSnapshot(live, snapshot)
    expect(cleared).toEqual([v2])
  })
})

describe('snapshotToMutations', () => {
  it('partitions a mixed queue into the wire-format mutations envelope', () => {
    const q: QueuedMutation[] = [
      cardState('a', 1),
      review('a', 100, 2),
      collection('iv', 3),
      review('b', 200, 4),
    ]
    const m = snapshotToMutations(q)
    expect(m.cardStates).toHaveLength(1)
    expect(m.collections).toHaveLength(1)
    expect(m.reviews).toHaveLength(2)
    expect(m.cardStates[0]).toEqual({ id: 'a', fsrs: { last_review: null, reps: 1 } })
    expect(m.collections[0]).toMatchObject({ id: 'iv', name: 'iv', deletedAt: null })
  })

  it('returns empty arrays for an empty queue', () => {
    const m = snapshotToMutations([])
    expect(m).toEqual({ cardStates: [], collections: [], reviews: [] })
  })
})

describe('validateQueue', () => {
  it('drops entries with unknown kind', () => {
    const valid = validateQueue([
      cardState('a', 1),
      { kind: 'lol', enqueuedAt: 2 },
      review('a', 100, 3),
    ])
    expect(valid).toHaveLength(2)
  })

  it('drops entries missing required fields', () => {
    const valid = validateQueue([
      { kind: 'cardState', enqueuedAt: 1 }, // missing id
      { kind: 'review', cardId: 'x', ratedAt: 1 }, // missing rating
      cardState('a', 1),
    ])
    expect(valid).toHaveLength(1)
    expect(valid[0]).toMatchObject({ kind: 'cardState', id: 'a' })
  })

  it('accepts a fully-formed collection entry', () => {
    const valid = validateQueue([collection('iv', 1, 2)])
    expect(valid).toHaveLength(1)
  })
})

describe('isEmpty', () => {
  it('detects empty', () => {
    expect(isEmpty([])).toBe(true)
    expect(isEmpty([cardState('a', 1)])).toBe(false)
  })
})
