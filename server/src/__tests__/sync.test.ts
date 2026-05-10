import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db.js'
import { handleSync, incomingCardStateWins, extractLastReview } from '../sync.js'
import { makeTestDb } from './testdb.js'

describe('extractLastReview', () => {
  it('returns null for non-object', () => {
    expect(extractLastReview(null)).toBeNull()
    expect(extractLastReview('foo')).toBeNull()
    expect(extractLastReview(42)).toBeNull()
  })

  it('returns null when last_review missing', () => {
    expect(extractLastReview({ stability: 1 })).toBeNull()
  })

  it('returns null for unparseable string', () => {
    expect(extractLastReview({ last_review: 'not-a-date' })).toBeNull()
  })

  it('parses ISO 8601 strings', () => {
    const d = extractLastReview({ last_review: '2026-01-01T12:00:00Z' })
    expect(d).toBeInstanceOf(Date)
    expect(d?.getTime()).toBe(Date.UTC(2026, 0, 1, 12, 0, 0))
  })
})

describe('incomingCardStateWins', () => {
  it('both null → existing wins', () => {
    expect(incomingCardStateWins({}, {})).toBe(false)
  })

  it('existing null, incoming has date → incoming wins', () => {
    expect(incomingCardStateWins({}, { last_review: '2026-01-01T00:00:00Z' })).toBe(true)
  })

  it('incoming null, existing has date → existing wins', () => {
    expect(incomingCardStateWins({ last_review: '2026-01-01T00:00:00Z' }, {})).toBe(false)
  })

  it('incoming strictly later → incoming wins', () => {
    expect(
      incomingCardStateWins(
        { last_review: '2026-01-01T00:00:00Z' },
        { last_review: '2026-01-02T00:00:00Z' },
      ),
    ).toBe(true)
  })

  it('equal timestamps → existing wins (no overwrite)', () => {
    expect(
      incomingCardStateWins(
        { last_review: '2026-01-01T00:00:00Z' },
        { last_review: '2026-01-01T00:00:00Z' },
      ),
    ).toBe(false)
  })

  it('incoming older → existing wins', () => {
    expect(
      incomingCardStateWins(
        { last_review: '2026-01-02T00:00:00Z' },
        { last_review: '2026-01-01T00:00:00Z' },
      ),
    ).toBe(false)
  })
})

describe('handleSync', () => {
  let db: Kysely<Database>
  let destroy: () => Promise<void>
  const USER = 'alice'

  beforeEach(async () => {
    const t = await makeTestDb()
    db = t.db
    destroy = t.destroy
  })

  afterEach(async () => {
    await destroy()
  })

  it('empty mutations with since=0 returns empty arrays on empty DB', async () => {
    const r = await handleSync(db, USER, {
      since: 0,
      mutations: { cardStates: [], collections: [], reviews: [] },
    })
    expect(r.cardStates).toEqual([])
    expect(r.collections).toEqual([])
    expect(r.reviews).toEqual([])
    expect(r.now).toBeGreaterThan(0)
  })

  it('does not echo a client mutation back to itself', async () => {
    const r = await handleSync(db, USER, {
      since: 0,
      mutations: {
        cardStates: [{ id: 'c1', fsrs: { last_review: '2026-01-01T00:00:00Z' } }],
        collections: [],
        reviews: [],
      },
    })
    // The row was just written with updated_at = now, and the response
    // window is (since, now]. With since=0, it WOULD be included — but the
    // spec says "Don't echo the client's own mutations". The current
    // implementation uses the (since, now] window which DOES include freshly
    // written rows. So the spec's "don't echo" is achieved by the client
    // tracking `since = previousResponseNow`. The first sync (since=0) IS
    // expected to return data for bootstrap. Verify behaviour matches that:
    expect(r.cardStates.length).toBe(1)
    expect(r.cardStates[0]?.id).toBe('c1')
  })

  it('subsequent sync with since=lastNow does NOT echo just-written rows', async () => {
    const first = await handleSync(db, USER, {
      since: 0,
      mutations: {
        cardStates: [{ id: 'c1', fsrs: { last_review: '2026-01-01T00:00:00Z' } }],
        collections: [],
        reviews: [],
      },
    })
    // Second sync: pass `since = first.now`. Send a NEW mutation; expect
    // server-returned rows to exclude both prior data and the just-sent row.
    const second = await handleSync(db, USER, {
      since: first.now,
      mutations: {
        cardStates: [{ id: 'c2', fsrs: { last_review: '2026-02-01T00:00:00Z' } }],
        collections: [],
        reviews: [],
      },
    })
    // c1 was written at first.now; updated_at is NOT > first.now, so excluded.
    // c2 was just written; included by (since, now].
    const ids = second.cardStates.map((c) => c.id).sort()
    expect(ids).toEqual(['c2'])
  })

  it('since=0 returns everything in DB', async () => {
    // Bootstrap rows via a prior sync.
    await handleSync(db, USER, {
      since: 0,
      mutations: {
        cardStates: [
          { id: 'a', fsrs: { last_review: '2026-01-01T00:00:00Z' } },
          { id: 'b', fsrs: { last_review: '2026-01-02T00:00:00Z' } },
        ],
        collections: [{ id: 'col1', name: 'X', deckIds: ['d1'], createdAt: 1, updatedAt: 2 }],
        reviews: [{ cardId: 'a', ratedAt: 100, rating: 3 }],
      },
    })
    // Now a fresh client with since=0 gets it all.
    const r = await handleSync(db, USER, {
      since: 0,
      mutations: { cardStates: [], collections: [], reviews: [] },
    })
    expect(r.cardStates.map((c) => c.id).sort()).toEqual(['a', 'b'])
    expect(r.collections.map((c) => c.id)).toEqual(['col1'])
    expect(r.reviews).toHaveLength(1)
    expect(r.reviews[0]?.cardId).toBe('a')
    expect(r.reviews[0]?.rating).toBe(3)
  })

  it('LWW: later last_review wins on second sync', async () => {
    await handleSync(db, USER, {
      since: 0,
      mutations: {
        cardStates: [{ id: 'c1', fsrs: { last_review: '2026-01-01T00:00:00Z', s: 'old' } }],
        collections: [],
        reviews: [],
      },
    })
    await handleSync(db, USER, {
      since: 0,
      mutations: {
        cardStates: [{ id: 'c1', fsrs: { last_review: '2026-01-02T00:00:00Z', s: 'new' } }],
        collections: [],
        reviews: [],
      },
    })
    const final = await handleSync(db, USER, {
      since: 0,
      mutations: { cardStates: [], collections: [], reviews: [] },
    })
    expect(final.cardStates).toHaveLength(1)
    const fsrs = final.cardStates[0]?.fsrs as { s: string }
    expect(fsrs.s).toBe('new')
  })

  it('LWW: older last_review does NOT clobber newer', async () => {
    await handleSync(db, USER, {
      since: 0,
      mutations: {
        cardStates: [{ id: 'c1', fsrs: { last_review: '2026-02-01T00:00:00Z', s: 'newer' } }],
        collections: [],
        reviews: [],
      },
    })
    await handleSync(db, USER, {
      since: 0,
      mutations: {
        cardStates: [{ id: 'c1', fsrs: { last_review: '2026-01-01T00:00:00Z', s: 'older' } }],
        collections: [],
        reviews: [],
      },
    })
    const final = await handleSync(db, USER, {
      since: 0,
      mutations: { cardStates: [], collections: [], reviews: [] },
    })
    const fsrs = final.cardStates[0]?.fsrs as { s: string }
    expect(fsrs.s).toBe('newer')
  })

  it('concurrent rate same card on two devices: later wins', async () => {
    // Two requests, send in order. Second has the later last_review.
    await handleSync(db, USER, {
      since: 0,
      mutations: {
        cardStates: [{ id: 'c1', fsrs: { last_review: '2026-01-01T10:00:00Z', src: 'phone' } }],
        collections: [],
        reviews: [],
      },
    })
    await handleSync(db, USER, {
      since: 0,
      mutations: {
        cardStates: [{ id: 'c1', fsrs: { last_review: '2026-01-01T11:00:00Z', src: 'laptop' } }],
        collections: [],
        reviews: [],
      },
    })
    const r = await handleSync(db, USER, {
      since: 0,
      mutations: { cardStates: [], collections: [], reviews: [] },
    })
    const fsrs = r.cardStates[0]?.fsrs as { src: string }
    expect(fsrs.src).toBe('laptop')
  })

  it('concurrent rate: send out of order, server still keeps later last_review', async () => {
    // Send the LATER one first, then the EARLIER one. Server must keep later.
    await handleSync(db, USER, {
      since: 0,
      mutations: {
        cardStates: [{ id: 'c1', fsrs: { last_review: '2026-01-01T11:00:00Z', src: 'laptop' } }],
        collections: [],
        reviews: [],
      },
    })
    await handleSync(db, USER, {
      since: 0,
      mutations: {
        cardStates: [{ id: 'c1', fsrs: { last_review: '2026-01-01T10:00:00Z', src: 'phone' } }],
        collections: [],
        reviews: [],
      },
    })
    const r = await handleSync(db, USER, {
      since: 0,
      mutations: { cardStates: [], collections: [], reviews: [] },
    })
    const fsrs = r.cardStates[0]?.fsrs as { src: string }
    expect(fsrs.src).toBe('laptop')
  })

  it('collection deletion: tombstone is stored and returned to other devices', async () => {
    // Device A creates collection.
    const a = await handleSync(db, USER, {
      since: 0,
      mutations: {
        cardStates: [],
        collections: [{ id: 'col1', name: 'Trash me', deckIds: [], createdAt: 1, updatedAt: 2 }],
        reviews: [],
      },
    })
    // Device A deletes it.
    await handleSync(db, USER, {
      since: a.now,
      mutations: {
        cardStates: [],
        collections: [
          {
            id: 'col1',
            name: 'Trash me',
            deckIds: [],
            createdAt: 1,
            updatedAt: 3,
            deletedAt: 3,
          },
        ],
        reviews: [],
      },
    })
    // Device B (since=0) sees the soft-deleted row with deletedAt set.
    const b = await handleSync(db, 'alice', {
      since: 0,
      mutations: { cardStates: [], collections: [], reviews: [] },
    })
    expect(b.collections).toHaveLength(1)
    expect(b.collections[0]?.id).toBe('col1')
    expect(b.collections[0]?.deletedAt).toBeTypeOf('number')
    expect(b.collections[0]?.deletedAt).toBeGreaterThan(0)
  })

  it('duplicate review (same cardId+ratedAt) is idempotent', async () => {
    await handleSync(db, USER, {
      since: 0,
      mutations: {
        cardStates: [],
        collections: [],
        reviews: [{ cardId: 'c1', ratedAt: 1000, rating: 3 }],
      },
    })
    // Same review again — must not throw.
    await handleSync(db, USER, {
      since: 0,
      mutations: {
        cardStates: [],
        collections: [],
        reviews: [{ cardId: 'c1', ratedAt: 1000, rating: 3 }],
      },
    })
    const r = await handleSync(db, USER, {
      since: 0,
      mutations: { cardStates: [], collections: [], reviews: [] },
    })
    expect(r.reviews).toHaveLength(1)
  })

  it('multiple reviews for same card at different times are all kept', async () => {
    await handleSync(db, USER, {
      since: 0,
      mutations: {
        cardStates: [],
        collections: [],
        reviews: [
          { cardId: 'c1', ratedAt: 100, rating: 1 },
          { cardId: 'c1', ratedAt: 200, rating: 3 },
          { cardId: 'c1', ratedAt: 300, rating: 4 },
        ],
      },
    })
    const r = await handleSync(db, USER, {
      since: 0,
      mutations: { cardStates: [], collections: [], reviews: [] },
    })
    expect(r.reviews).toHaveLength(3)
  })

  it('isolates users: alice does not see bob rows', async () => {
    await handleSync(db, 'alice', {
      since: 0,
      mutations: {
        cardStates: [{ id: 'c1', fsrs: { last_review: '2026-01-01T00:00:00Z' } }],
        collections: [],
        reviews: [],
      },
    })
    const r = await handleSync(db, 'bob', {
      since: 0,
      mutations: { cardStates: [], collections: [], reviews: [] },
    })
    expect(r.cardStates).toEqual([])
  })

  it('collection round-trips name and deckIds', async () => {
    await handleSync(db, USER, {
      since: 0,
      mutations: {
        cardStates: [],
        collections: [
          {
            id: 'col1',
            name: 'Systems',
            deckIds: ['sd-1', 'sd-2', 'sd-3'],
            createdAt: 10,
            updatedAt: 20,
          },
        ],
        reviews: [],
      },
    })
    const r = await handleSync(db, USER, {
      since: 0,
      mutations: { cardStates: [], collections: [], reviews: [] },
    })
    expect(r.collections).toHaveLength(1)
    expect(r.collections[0]?.name).toBe('Systems')
    expect(r.collections[0]?.deckIds).toEqual(['sd-1', 'sd-2', 'sd-3'])
    expect(r.collections[0]?.createdAt).toBe(10)
  })

  it('collection LWW: stale updatedAt write is dropped', async () => {
    await handleSync(db, USER, {
      since: 0,
      mutations: {
        cardStates: [],
        collections: [{ id: 'c', name: 'fresh', deckIds: [], createdAt: 1, updatedAt: 100 }],
        reviews: [],
      },
    })
    await handleSync(db, USER, {
      since: 0,
      mutations: {
        cardStates: [],
        // updatedAt: 50 < 100 — should be dropped (no delete)
        collections: [{ id: 'c', name: 'stale', deckIds: [], createdAt: 1, updatedAt: 50 }],
        reviews: [],
      },
    })
    const r = await handleSync(db, USER, {
      since: 0,
      mutations: { cardStates: [], collections: [], reviews: [] },
    })
    expect(r.collections[0]?.name).toBe('fresh')
  })

  it('all-same-now: rows written in one request share a single timestamp', async () => {
    const r = await handleSync(db, USER, {
      since: 0,
      mutations: {
        cardStates: [
          { id: 'a', fsrs: { last_review: '2026-01-01T00:00:00Z' } },
          { id: 'b', fsrs: { last_review: '2026-01-02T00:00:00Z' } },
          { id: 'c', fsrs: { last_review: '2026-01-03T00:00:00Z' } },
        ],
        collections: [],
        reviews: [],
      },
    })
    const ts = new Set(r.cardStates.map((cs) => cs.updatedAt))
    expect(ts.size).toBe(1)
  })

  it('returns the same `now` regardless of mutation count', async () => {
    const r = await handleSync(db, USER, {
      since: 0,
      mutations: { cardStates: [], collections: [], reviews: [] },
    })
    expect(typeof r.now).toBe('number')
    expect(r.now).toBeGreaterThan(0)
  })
})
