import { describe, it, expect } from 'vitest'
import { REVIEW_LOG_CAP } from '../storage'
import {
  extractLastReview,
  incomingCardStateWins,
  reconcile,
  reconcileCardStates,
  reconcileCollections,
  reconcileReviews,
} from './reconcile'
import type { CardStateMap } from '../storage'
import type { Collection, ReviewLogEntry } from '../types'
import type { SyncResponse } from './types'

describe('extractLastReview', () => {
  it('returns null on null/undefined/non-object input', () => {
    expect(extractLastReview(null)).toBeNull()
    expect(extractLastReview(undefined)).toBeNull()
    expect(extractLastReview('hi')).toBeNull()
  })

  it('parses ISO string last_review', () => {
    const d = extractLastReview({ last_review: '2026-01-01T00:00:00Z' })
    expect(d).toBeInstanceOf(Date)
    expect(d?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('preserves a Date instance', () => {
    const orig = new Date('2026-02-02T00:00:00Z')
    expect(extractLastReview({ last_review: orig })).toBe(orig)
  })

  it('returns null for an invalid date string', () => {
    expect(extractLastReview({ last_review: 'not a date' })).toBeNull()
  })

  it('returns null when last_review is missing', () => {
    expect(extractLastReview({ reps: 1 })).toBeNull()
  })
})

describe('incomingCardStateWins', () => {
  const ex = (s: string | null) => ({ last_review: s })

  it('strictly-later incoming wins', () => {
    expect(incomingCardStateWins(ex('2026-01-01T00:00:00Z'), ex('2026-01-02T00:00:00Z'))).toBe(true)
  })

  it('equal timestamps: existing wins', () => {
    expect(incomingCardStateWins(ex('2026-01-01T00:00:00Z'), ex('2026-01-01T00:00:00Z'))).toBe(
      false,
    )
  })

  it('older incoming loses', () => {
    expect(incomingCardStateWins(ex('2026-01-02T00:00:00Z'), ex('2026-01-01T00:00:00Z'))).toBe(
      false,
    )
  })

  it('null existing + non-null incoming: incoming wins', () => {
    expect(incomingCardStateWins(ex(null), ex('2026-01-01T00:00:00Z'))).toBe(true)
  })

  it('non-null existing + null incoming: existing wins', () => {
    expect(incomingCardStateWins(ex('2026-01-01T00:00:00Z'), ex(null))).toBe(false)
  })

  it('both null: existing wins (null-tie-prefers-existing)', () => {
    expect(incomingCardStateWins(ex(null), ex(null))).toBe(false)
  })
})

describe('reconcileCardStates', () => {
  it('inserts a previously-unknown id', () => {
    const current: CardStateMap = {}
    const next = reconcileCardStates(current, [
      { id: 'a', fsrs: { last_review: '2026-01-01T00:00:00Z', reps: 1 }, updatedAt: 1 },
    ])
    expect(next['a']).toBeTruthy()
  })

  it('replaces when incoming wins LWW', () => {
    const current: CardStateMap = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      a: { last_review: new Date('2026-01-01T00:00:00Z'), reps: 1 } as any,
    }
    const next = reconcileCardStates(current, [
      { id: 'a', fsrs: { last_review: '2026-01-02T00:00:00Z', reps: 2 }, updatedAt: 1 },
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((next['a'] as any).reps).toBe(2)
    // last_review revived to a Date
    expect(next['a']?.last_review).toBeInstanceOf(Date)
  })

  it('keeps local when local wins LWW', () => {
    const current: CardStateMap = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      a: { last_review: new Date('2026-01-05T00:00:00Z'), reps: 5 } as any,
    }
    const next = reconcileCardStates(current, [
      { id: 'a', fsrs: { last_review: '2026-01-02T00:00:00Z', reps: 2 }, updatedAt: 1 },
    ])
    expect(next).toBe(current) // unchanged reference
  })
})

describe('reconcileCollections', () => {
  const base: Collection = {
    id: 'iv',
    name: 'Interview',
    deckIds: ['nato'],
    createdAt: 100,
    updatedAt: 100,
    deletedAt: null,
  }

  it('inserts a new collection from a server row', () => {
    const next = reconcileCollections([], [{ ...base, updatedAt: 200, deletedAt: null }])
    expect(next).toHaveLength(1)
    expect(next[0]?.id).toBe('iv')
  })

  it('updates an existing collection when incoming.updatedAt is newer', () => {
    const next = reconcileCollections(
      [base],
      [{ ...base, name: 'Interview Prep', updatedAt: 500, deletedAt: null }],
    )
    expect(next[0]?.name).toBe('Interview Prep')
  })

  it('keeps local when incoming.updatedAt is older or equal (no delete)', () => {
    const next = reconcileCollections(
      [{ ...base, updatedAt: 500 }],
      [{ ...base, name: 'Stale', updatedAt: 300, deletedAt: null }],
    )
    expect(next[0]?.name).toBe('Interview')
  })

  it('applies a tombstone (deletedAt != null) — removes from local state', () => {
    const next = reconcileCollections([base], [{ ...base, updatedAt: 500, deletedAt: 500 }])
    expect(next).toEqual([])
  })

  it('applies a tombstone even when its updatedAt is older (delete always wins on this branch)', () => {
    // Note: the rule is "stale write that isn't a delete — drop it". A delete
    // bypasses the staleness check on the client (matching server semantics
    // for `incomingDeletedAt === null` short-circuit).
    const next = reconcileCollections(
      [{ ...base, updatedAt: 500 }],
      [{ ...base, updatedAt: 300, deletedAt: 300 }],
    )
    expect(next).toEqual([])
  })

  it('returns the same reference when nothing changes', () => {
    const current = [base]
    const next = reconcileCollections(current, [])
    expect(next).toBe(current)
  })
})

describe('reconcileReviews', () => {
  const r = (cardId: string, ratedAt: number, rating = 3): ReviewLogEntry => ({
    cardId,
    ratedAt,
    rating,
  })

  it('inserts new reviews, sorted by ratedAt ascending', () => {
    const next = reconcileReviews([r('a', 100)], [{ cardId: 'a', ratedAt: 50, rating: 3 }])
    expect(next.map((x) => x.ratedAt)).toEqual([50, 100])
  })

  it('idempotent on (cardId, ratedAt) — duplicate is skipped', () => {
    const next = reconcileReviews([r('a', 100)], [{ cardId: 'a', ratedAt: 100, rating: 1 }])
    expect(next).toHaveLength(1)
    expect(next[0]?.rating).toBe(3) // local rating kept
  })

  it('returns the same reference when no rows are added', () => {
    const current = [r('a', 100)]
    expect(reconcileReviews(current, [])).toBe(current)
    expect(reconcileReviews(current, [{ cardId: 'a', ratedAt: 100, rating: 3 }])).toBe(current)
  })

  it('caps merged list at REVIEW_LOG_CAP (oldest dropped first)', () => {
    const current = Array.from({ length: REVIEW_LOG_CAP }, (_, i) => r('x', i))
    const additions = [{ cardId: 'y', ratedAt: REVIEW_LOG_CAP + 5, rating: 3 }]
    const next = reconcileReviews(current, additions)
    expect(next).toHaveLength(REVIEW_LOG_CAP)
    expect(next[0]?.ratedAt).toBe(1) // oldest (ratedAt=0) dropped
    expect(next.at(-1)?.cardId).toBe('y')
  })
})

describe('reconcile (top-level)', () => {
  it('applies all three slices', () => {
    const response: SyncResponse = {
      now: 1000,
      cardStates: [{ id: 'a', fsrs: { last_review: '2026-01-01T00:00:00Z' }, updatedAt: 1000 }],
      collections: [
        {
          id: 'iv',
          name: 'Interview',
          deckIds: ['nato'],
          createdAt: 0,
          updatedAt: 1000,
          deletedAt: null,
        },
      ],
      reviews: [{ cardId: 'a', ratedAt: 500, rating: 3 }],
    }
    const next = reconcile({ cardStates: {}, collections: [], reviews: [] }, response)
    expect(next.cardStates['a']).toBeTruthy()
    expect(next.collections).toHaveLength(1)
    expect(next.reviews).toHaveLength(1)
  })
})
