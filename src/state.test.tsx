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
} from './state'
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

  it('reset-progress clears card states but not collections', () => {
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

    act(() => {
      result.current.reset()
    })
    expect(result.current.states).toEqual({})
    expect(result.current.collections).toHaveLength(1) // not wiped
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
