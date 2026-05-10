import { describe, it, expect, beforeEach } from 'vitest'
import { act, render, renderHook } from '@testing-library/react'
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
} from './state'
import { REVIEW_LOG_CAP } from './storage'
import type { ReactNode } from 'react'

const wrapper = ({ children }: { children: ReactNode }) => <StateProvider>{children}</StateProvider>

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
      <StateProvider>
        <div>hi</div>
      </StateProvider>,
    )
    expect(container.textContent).toBe('hi')
  })
})
