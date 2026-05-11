import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, renderHook, waitFor } from '@testing-library/react'
import { Rating } from 'ts-fsrs'
import { materialise } from './decks/load'
import {
  StateProvider,
  useAddCollection,
  useCardStates,
  useCollections,
  useDeleteCollection,
  useRateCard,
  useResetProgress,
  useReviews,
  useSyncStatus,
} from './state'
import { REVIEW_LOG_CAP } from './storage'
import type { SyncResponse } from './sync/types'
import type { ReactNode } from 'react'

// Default wrapper: sync layer disabled so the existing test suite continues
// to exercise pure state behaviour without spinning up a periodic fetch loop.
const wrapper = ({ children }: { children: ReactNode }) => (
  <StateProvider enableSync={false}>{children}</StateProvider>
)

const t0 = new Date('2026-01-01T00:00:00Z')

beforeEach(() => {
  localStorage.clear()
})

describe('StateProvider', () => {
  it('starts with empty cardStates and collections when nothing is stored', () => {
    const { result } = renderHook(
      () => ({
        cardStates: useCardStates(),
        collections: useCollections(),
      }),
      { wrapper },
    )
    expect(result.current.cardStates).toEqual({})
    expect(result.current.collections).toEqual([])
  })

  it('hydrates synchronously from localStorage on mount', () => {
    localStorage.setItem(
      'flashcards:collections',
      JSON.stringify([
        {
          id: 'preexisting',
          name: 'Pre-existing',
          deckIds: ['nato'],
          createdAt: t0.getTime(),
        },
      ]),
    )
    const { result } = renderHook(() => useCollections(), { wrapper })
    expect(result.current).toHaveLength(1)
    expect(result.current[0]?.id).toBe('preexisting')
  })

  it('hydrates cardStates and collections together from localStorage', () => {
    localStorage.setItem(
      'flashcards:cards',
      JSON.stringify({
        'd:a': {
          due: '2026-02-01T00:00:00Z',
          stability: 1,
          difficulty: 5,
          elapsed_days: 0,
          scheduled_days: 1,
          reps: 1,
          lapses: 0,
          state: 1,
          last_review: '2026-01-01T00:00:00Z',
        },
      }),
    )
    localStorage.setItem(
      'flashcards:collections',
      JSON.stringify([{ id: 'iv', name: 'Interview', deckIds: ['nato'], createdAt: t0.getTime() }]),
    )
    const { result } = renderHook(
      () => ({
        cards: useCardStates(),
        collections: useCollections(),
      }),
      { wrapper },
    )
    expect(Object.keys(result.current.cards)).toEqual(['d:a'])
    expect(result.current.collections).toHaveLength(1)
  })

  it('persists rate-card mutations to localStorage', () => {
    const deck = materialise(
      {
        id: 'd',
        name: 'D',
        description: '',
        cards: [{ id: 'a', term: 'A', definition: 'a', category: 'x' }],
      },
      t0,
    )
    const { result } = renderHook(() => ({ rate: useRateCard(), states: useCardStates() }), {
      wrapper,
    })
    act(() => {
      result.current.rate(deck.cards[0]!, Rating.Good, t0)
    })
    expect(result.current.states['d:a']?.reps).toBe(1)
    const stored = JSON.parse(localStorage.getItem('flashcards:cards') ?? '{}')
    expect(stored['d:a']).toBeTruthy()
  })

  it('add → delete collection round-trips through state', () => {
    const { result } = renderHook(
      () => ({
        add: useAddCollection(),
        del: useDeleteCollection(),
        list: useCollections(),
      }),
      { wrapper },
    )
    act(() => {
      result.current.add({
        id: 'iv',
        name: 'Interview',
        deckIds: ['nato', 'latency'],
        createdAt: t0.getTime(),
      })
    })
    expect(result.current.list.map((c) => c.id)).toEqual(['iv'])

    act(() => {
      result.current.del('iv')
    })
    expect(result.current.list).toEqual([])
  })

  it('persists collection mutations to localStorage', () => {
    const { result } = renderHook(() => ({ add: useAddCollection(), del: useDeleteCollection() }), {
      wrapper,
    })
    act(() => {
      result.current.add({
        id: 'iv',
        name: 'Interview',
        deckIds: ['nato'],
        createdAt: t0.getTime(),
      })
    })
    const stored = JSON.parse(localStorage.getItem('flashcards:collections') ?? '[]')
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe('iv')

    act(() => {
      result.current.del('iv')
    })
    const cleared = JSON.parse(localStorage.getItem('flashcards:collections') ?? '[]')
    expect(cleared).toEqual([])
  })

  it('add with same id replaces (does not duplicate)', () => {
    const { result } = renderHook(() => ({ add: useAddCollection(), list: useCollections() }), {
      wrapper,
    })
    act(() => {
      result.current.add({ id: 'x', name: 'First', deckIds: ['nato'], createdAt: 1 })
    })
    act(() => {
      result.current.add({ id: 'x', name: 'Second', deckIds: ['latency'], createdAt: 2 })
    })
    expect(result.current.list).toHaveLength(1)
    expect(result.current.list[0]?.name).toBe('Second')
    expect(result.current.list[0]?.deckIds).toEqual(['latency'])
  })

  it('reset-progress clears card states + review log but not collections', () => {
    const deck = materialise(
      {
        id: 'd',
        name: 'D',
        description: '',
        cards: [{ id: 'a', term: 'A', definition: 'a', category: 'x' }],
      },
      t0,
    )
    const { result } = renderHook(
      () => ({
        rate: useRateCard(),
        add: useAddCollection(),
        reset: useResetProgress(),
        states: useCardStates(),
        collections: useCollections(),
        reviews: useReviews(),
      }),
      { wrapper },
    )
    act(() => {
      result.current.rate(deck.cards[0]!, Rating.Good, t0)
      result.current.add({
        id: 'keep',
        name: 'Keep me',
        deckIds: ['d'],
        createdAt: t0.getTime(),
      })
    })
    expect(Object.keys(result.current.states)).toHaveLength(1)
    expect(result.current.collections).toHaveLength(1)
    expect(result.current.reviews).toHaveLength(1)

    act(() => {
      result.current.reset()
    })
    expect(result.current.states).toEqual({})
    expect(result.current.reviews).toEqual([])
    expect(result.current.collections).toHaveLength(1) // not wiped
  })

  it('records a review log entry on each rate and persists it', () => {
    const deck = materialise(
      {
        id: 'd',
        name: 'D',
        description: '',
        cards: [{ id: 'a', term: 'A', definition: 'a', category: 'x' }],
      },
      t0,
    )
    const { result } = renderHook(() => ({ rate: useRateCard(), reviews: useReviews() }), {
      wrapper,
    })
    act(() => {
      result.current.rate(deck.cards[0]!, Rating.Good, t0)
      result.current.rate(deck.cards[0]!, Rating.Good, new Date(t0.getTime() + 60_000))
    })
    expect(result.current.reviews).toHaveLength(2)
    expect(result.current.reviews[0]).toMatchObject({
      cardId: 'd:a',
      rating: Rating.Good,
    })
    const persisted = JSON.parse(localStorage.getItem('flashcards:reviews') ?? '[]')
    expect(persisted).toHaveLength(2)
  })

  it('caps the review log at REVIEW_LOG_CAP entries (oldest dropped first)', () => {
    // Pre-seed localStorage with cap+5 entries; init() will load all of them,
    // and a single new RATE_CARD should trim back to the cap.
    const seeded = Array.from({ length: REVIEW_LOG_CAP + 5 }, (_, i) => ({
      cardId: `seed:${i}`,
      ratedAt: t0.getTime() + i,
      rating: Rating.Good,
    }))
    localStorage.setItem('flashcards:reviews', JSON.stringify(seeded))

    const deck = materialise(
      {
        id: 'd',
        name: 'D',
        description: '',
        cards: [{ id: 'a', term: 'A', definition: 'a', category: 'x' }],
      },
      t0,
    )
    const { result } = renderHook(() => ({ rate: useRateCard(), reviews: useReviews() }), {
      wrapper,
    })
    expect(result.current.reviews).toHaveLength(REVIEW_LOG_CAP + 5)
    act(() => {
      result.current.rate(deck.cards[0]!, Rating.Good, new Date(t0.getTime() + 99_999))
    })
    expect(result.current.reviews).toHaveLength(REVIEW_LOG_CAP)
    // Oldest seeded entries should have been dropped from the front.
    expect(result.current.reviews[0]?.cardId).not.toBe('seed:0')
    // Newest entry is the just-rated card.
    expect(result.current.reviews.at(-1)?.cardId).toBe('d:a')
  })
})

describe('StateProvider integration', () => {
  it('renders children', () => {
    const { container } = render(
      <StateProvider enableSync={false}>
        <div>hi</div>
      </StateProvider>,
    )
    expect(container.textContent).toBe('hi')
  })
})

describe('StateProvider sync integration', () => {
  // Build a wrapper that mounts the real sync layer with an injected fetch.
  function syncWrapper(fetchImpl: typeof fetch) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return (
        <StateProvider syncFetch={fetchImpl} syncOnMount={true} syncIntervalMs={10_000_000}>
          {children}
        </StateProvider>
      )
    }
  }

  function jsonResponse(body: SyncResponse): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('enqueues + flushes a RATE_CARD mutation, clearing the queue and advancing last-sync-at', async () => {
    const t1 = 1_700_000_000_000
    let lastReq: {
      since: number
      mutations: { cardStates: unknown[]; reviews: unknown[] }
    } | null = null
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      lastReq = JSON.parse(init?.body as string)
      const res: SyncResponse = {
        now: t1,
        cardStates: [],
        collections: [],
        reviews: [],
      }
      return Promise.resolve(jsonResponse(res))
    })

    const deck = materialise(
      {
        id: 'd',
        name: 'D',
        description: '',
        cards: [{ id: 'a', term: 'A', definition: 'a', category: 'x' }],
      },
      t0,
    )

    // Use a short interval so the post-rate flush happens promptly.
    function ShortWrapper({ children }: { children: ReactNode }) {
      return (
        <StateProvider
          syncFetch={fetchMock as unknown as typeof fetch}
          syncOnMount={true}
          syncIntervalMs={50}
        >
          {children}
        </StateProvider>
      )
    }

    const { result } = renderHook(() => ({ rate: useRateCard(), status: useSyncStatus() }), {
      wrapper: ShortWrapper,
    })

    // Wait for the mount-time (empty) sync to land first.
    await waitFor(() => {
      expect(result.current.status.state).toBe('synced')
    })

    act(() => {
      result.current.rate(deck.cards[0]!, Rating.Good, t0)
    })

    // Wait for a subsequent flush that includes the rated card.
    await waitFor(() => {
      expect(lastReq).not.toBeNull()
      expect(lastReq!.mutations.cardStates.length).toBeGreaterThanOrEqual(1)
      expect(lastReq!.mutations.reviews.length).toBeGreaterThanOrEqual(1)
    })

    // Eventually back to synced with the queue drained.
    await waitFor(() => {
      const q = JSON.parse(localStorage.getItem('flashcards:sync-queue') ?? '[]')
      expect(q).toEqual([])
    })
    expect(result.current.status.state).toBe('synced')
    expect(result.current.status.lastSyncAt).toBe(t1)
    expect(JSON.parse(localStorage.getItem('flashcards:last-sync-at') ?? '0')).toBe(t1)
  })

  it('marks status offline on network failure (TypeError)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useSyncStatus(), {
      wrapper: syncWrapper(fetchMock as unknown as typeof fetch),
    })
    await waitFor(() => {
      expect(result.current.state).toBe('offline')
    })
  })

  it('marks status error on a 5xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('boom', { status: 503 }))
    const { result } = renderHook(() => useSyncStatus(), {
      wrapper: syncWrapper(fetchMock as unknown as typeof fetch),
    })
    await waitFor(() => {
      expect(result.current.state).toBe('error')
    })
    expect(result.current.errorMessage).toMatch(/HTTP 503/)
  })

  it('RESET_PROGRESS clears the sync queue and resets last-sync-at', async () => {
    // Seed storage so we have a non-zero last-sync-at and a pending queue.
    localStorage.setItem('flashcards:last-sync-at', JSON.stringify(123_456_789))
    localStorage.setItem(
      'flashcards:sync-queue',
      JSON.stringify([{ kind: 'review', cardId: 'a', ratedAt: 1, rating: 3, enqueuedAt: 1 }]),
    )
    // fetch never actually resolves — we just want the immediate sync to
    // be in-flight, not affect the reset behaviour.
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useResetProgress(), {
      wrapper: syncWrapper(fetchMock as unknown as typeof fetch),
    })
    act(() => {
      result.current()
    })
    expect(JSON.parse(localStorage.getItem('flashcards:sync-queue') ?? '[]')).toEqual([])
    expect(JSON.parse(localStorage.getItem('flashcards:last-sync-at') ?? '0')).toBe(0)
  })

  it('preserves a mutation enqueued mid-sync (in-flight guard does not drop it)', async () => {
    const t1 = 1_700_000_000_000
    // First fetch: a slow, pending Promise we resolve manually mid-test so
    // the user can rate a card while the request is still in-flight. The
    // periodic interval then picks up the new entry on the next tick.
    let resolveFirst!: (res: Response) => void
    const firstPromise = new Promise<Response>((r) => (resolveFirst = r))
    let call = 0
    const seenBodies: { since: number; mutations: { reviews: unknown[] } }[] = []
    const fetchMock = vi.fn().mockImplementation((_u: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string)
      seenBodies.push(body)
      call += 1
      if (call === 1) return firstPromise
      const res: SyncResponse = { now: t1 + call, cardStates: [], collections: [], reviews: [] }
      return Promise.resolve(jsonResponse(res))
    })

    const deck = materialise(
      {
        id: 'd',
        name: 'D',
        description: '',
        cards: [{ id: 'a', term: 'A', definition: 'a', category: 'x' }],
      },
      t0,
    )

    function ShortWrapper({ children }: { children: ReactNode }) {
      return (
        <StateProvider
          syncFetch={fetchMock as unknown as typeof fetch}
          syncOnMount={true}
          syncIntervalMs={50}
        >
          {children}
        </StateProvider>
      )
    }

    const { result } = renderHook(() => ({ rate: useRateCard(), status: useSyncStatus() }), {
      wrapper: ShortWrapper,
    })

    // While the first sync is in-flight, rate a card. This must go into the
    // queue and survive the upcoming removeSnapshot() of the first sync.
    act(() => {
      result.current.rate(deck.cards[0]!, Rating.Good, t0)
    })
    // Sanity: queue now has the mutation persisted.
    expect(
      JSON.parse(localStorage.getItem('flashcards:sync-queue') ?? '[]').length,
    ).toBeGreaterThan(0)

    // Now resolve the in-flight first sync (which had an empty snapshot).
    act(() => {
      resolveFirst(jsonResponse({ now: t1, cardStates: [], collections: [], reviews: [] }))
    })

    // Eventually a subsequent sync POSTs the rated card.
    await waitFor(() => {
      const withCard = seenBodies.find((b) => b.mutations.reviews.length > 0)
      expect(withCard).toBeTruthy()
    })

    // Queue eventually drained.
    await waitFor(() => {
      const q = JSON.parse(localStorage.getItem('flashcards:sync-queue') ?? '[]')
      expect(q).toEqual([])
    })
    expect(result.current.status.state).toBe('synced')
  })

  it('reconciles a server-pushed cardState into local state', async () => {
    const t1 = 1_700_000_000_000
    const incoming: SyncResponse = {
      now: t1,
      cardStates: [
        {
          id: 'remote:card',
          fsrs: {
            due: '2026-02-01T00:00:00Z',
            stability: 1,
            difficulty: 5,
            elapsed_days: 0,
            scheduled_days: 1,
            reps: 1,
            lapses: 0,
            state: 1,
            last_review: '2026-01-01T00:00:00Z',
          },
          updatedAt: t1,
        },
      ],
      collections: [],
      reviews: [],
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(incoming))

    const { result } = renderHook(() => ({ cards: useCardStates(), status: useSyncStatus() }), {
      wrapper: syncWrapper(fetchMock as unknown as typeof fetch),
    })

    await waitFor(() => {
      expect(result.current.status.state).toBe('synced')
    })
    expect(result.current.cards['remote:card']).toBeTruthy()
    expect(result.current.cards['remote:card']?.last_review).toBeInstanceOf(Date)
  })
})
