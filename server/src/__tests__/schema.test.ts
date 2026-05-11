import { describe, it, expect } from 'vitest'
import { SyncRequest } from '../schema.js'

describe('SyncRequest schema', () => {
  it('accepts a minimal request (since=0, no mutations)', () => {
    const r = SyncRequest.safeParse({ since: 0 })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.mutations.cardStates).toEqual([])
      expect(r.data.mutations.collections).toEqual([])
      expect(r.data.mutations.reviews).toEqual([])
    }
  })

  it('accepts a request with empty mutations object', () => {
    const r = SyncRequest.safeParse({ since: 0, mutations: {} })
    expect(r.success).toBe(true)
  })

  it('rejects negative since', () => {
    const r = SyncRequest.safeParse({ since: -1 })
    expect(r.success).toBe(false)
  })

  it('rejects non-integer since', () => {
    const r = SyncRequest.safeParse({ since: 1.5 })
    expect(r.success).toBe(false)
  })

  it('rejects missing since', () => {
    const r = SyncRequest.safeParse({})
    expect(r.success).toBe(false)
  })

  it('accepts a card-state mutation', () => {
    const r = SyncRequest.safeParse({
      since: 0,
      mutations: {
        cardStates: [{ id: 'c1', fsrs: { stability: 1, last_review: '2026-01-01T00:00:00Z' } }],
      },
    })
    expect(r.success).toBe(true)
  })

  it('rejects a card-state mutation with empty id', () => {
    const r = SyncRequest.safeParse({
      since: 0,
      mutations: { cardStates: [{ id: '', fsrs: {} }] },
    })
    expect(r.success).toBe(false)
  })

  it('rejects a card-state mutation missing fsrs', () => {
    const r = SyncRequest.safeParse({
      since: 0,
      mutations: { cardStates: [{ id: 'c1' }] },
    })
    expect(r.success).toBe(false)
  })

  it('accepts a collection mutation with deletedAt null', () => {
    const r = SyncRequest.safeParse({
      since: 0,
      mutations: {
        collections: [
          {
            id: 'col1',
            name: 'My deck',
            deckIds: ['a', 'b'],
            createdAt: 1,
            updatedAt: 2,
            deletedAt: null,
          },
        ],
      },
    })
    expect(r.success).toBe(true)
  })

  it('accepts a collection mutation without deletedAt', () => {
    const r = SyncRequest.safeParse({
      since: 0,
      mutations: {
        collections: [{ id: 'col1', name: 'X', deckIds: [], createdAt: 0, updatedAt: 0 }],
      },
    })
    expect(r.success).toBe(true)
  })

  it('rejects a collection with negative createdAt', () => {
    const r = SyncRequest.safeParse({
      since: 0,
      mutations: {
        collections: [{ id: 'col1', name: 'X', deckIds: [], createdAt: -1, updatedAt: 0 }],
      },
    })
    expect(r.success).toBe(false)
  })

  it('accepts review mutations with all valid ratings 0-4', () => {
    for (const rating of [0, 1, 2, 3, 4]) {
      const r = SyncRequest.safeParse({
        since: 0,
        mutations: { reviews: [{ cardId: 'c1', ratedAt: 100, rating }] },
      })
      expect(r.success).toBe(true)
    }
  })

  it('rejects review with out-of-range rating', () => {
    const r = SyncRequest.safeParse({
      since: 0,
      mutations: { reviews: [{ cardId: 'c1', ratedAt: 100, rating: 5 }] },
    })
    expect(r.success).toBe(false)
  })

  it('rejects review with negative rating', () => {
    const r = SyncRequest.safeParse({
      since: 0,
      mutations: { reviews: [{ cardId: 'c1', ratedAt: 100, rating: -1 }] },
    })
    expect(r.success).toBe(false)
  })

  it('rejects review with empty cardId', () => {
    const r = SyncRequest.safeParse({
      since: 0,
      mutations: { reviews: [{ cardId: '', ratedAt: 100, rating: 3 }] },
    })
    expect(r.success).toBe(false)
  })
})
