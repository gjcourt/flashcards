import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { resetManifestCache, useDeck, useDecks, useManifest } from './hooks'

const manifest = {
  decks: [
    {
      id: 'tiny',
      name: 'Tiny',
      description: 'Just a couple cards.',
      path: 'decks/tiny.json',
    },
    {
      id: 'small',
      name: 'Small',
      description: 'A few more.',
      path: 'decks/small.json',
    },
  ],
}

const tinyDeck = {
  id: 'tiny',
  name: 'Tiny',
  description: 'Just a couple cards.',
  cards: [
    { id: 'one', term: 'One', definition: 'First', category: 'x' },
    { id: 'two', term: 'Two', definition: 'Second', category: 'x' },
  ],
}

const smallDeck = {
  id: 'small',
  name: 'Small',
  description: 'A few more.',
  cards: [{ id: 'alpha', term: 'A', definition: 'Alfa', category: 'letters' }],
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  resetManifestCache()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input)
      if (url.endsWith('decks/manifest.json')) return jsonResponse(manifest)
      if (url.endsWith('decks/tiny.json')) return jsonResponse(tinyDeck)
      if (url.endsWith('decks/small.json')) return jsonResponse(smallDeck)
      return new Response('not found', { status: 404 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useManifest', () => {
  it('transitions from loading to ready', async () => {
    const { result } = renderHook(() => useManifest())
    expect(result.current.status).toBe('loading')

    await waitFor(() => {
      expect(result.current.status).toBe('ready')
    })
    expect(result.current.data?.decks).toHaveLength(2)
    expect(result.current.data?.decks[0]?.id).toBe('tiny')
  })
})

describe('useDeck', () => {
  it('loads a deck by id and returns ready', async () => {
    const { result } = renderHook(() => useDeck('tiny'))
    expect(result.current.status).toBe('loading')

    await waitFor(() => {
      expect(result.current.status).toBe('ready')
    })

    const deck = result.current.data!
    expect(deck.id).toBe('tiny')
    expect(deck.cards).toHaveLength(2)
    // materialise() prefixed the card ids with the deck id
    expect(deck.cards[0]?.id).toBe('tiny:one')
    expect(deck.cards[1]?.deckId).toBe('tiny')
  })

  it('returns error status when deck id is unknown', async () => {
    const { result } = renderHook(() => useDeck('nonexistent'))

    await waitFor(() => {
      expect(result.current.status).toBe('error')
    })
    expect(result.current.error?.message).toMatch(/not found/i)
  })
})

describe('useDecks', () => {
  it('loads multiple decks for a collection', async () => {
    const { result } = renderHook(() => useDecks(['tiny', 'small']))
    await waitFor(() => {
      expect(result.current.status).toBe('ready')
    })
    const decks = result.current.data!
    expect(decks).toHaveLength(2)
    expect(decks.flatMap((d) => d.cards.map((c) => c.id))).toEqual([
      'tiny:one',
      'tiny:two',
      'small:alpha',
    ])
  })

  it('loads every deck when ids is null (the /all route case)', async () => {
    const { result } = renderHook(() => useDecks(null))
    await waitFor(() => {
      expect(result.current.status).toBe('ready')
    })
    expect(result.current.data?.map((d) => d.id)).toEqual(['tiny', 'small'])
  })

  it('errors when any requested deck id is missing from the manifest', async () => {
    const { result } = renderHook(() => useDecks(['tiny', 'ghost']))
    await waitFor(() => {
      expect(result.current.status).toBe('error')
    })
    expect(result.current.error?.message).toMatch(/ghost/)
  })

  it('preserves caller-specified deck order regardless of manifest order', async () => {
    // Manifest order is [tiny, small]; ask for them backwards.
    const { result } = renderHook(() => useDecks(['small', 'tiny']))
    await waitFor(() => {
      expect(result.current.status).toBe('ready')
    })
    expect(result.current.data?.map((d) => d.id)).toEqual(['small', 'tiny'])
  })

  it('returns an empty array when ids is []', async () => {
    const { result } = renderHook(() => useDecks([]))
    await waitFor(() => {
      expect(result.current.status).toBe('ready')
    })
    expect(result.current.data).toEqual([])
  })

  it('does not refetch when ids array identity changes but contents do not', async () => {
    const fetchSpy = vi.mocked(globalThis.fetch as never) as ReturnType<typeof vi.fn>
    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => useDecks(ids), {
      initialProps: { ids: ['tiny'] },
    })
    await waitFor(() => {
      expect(result.current.status).toBe('ready')
    })
    const callsAfterFirstLoad = fetchSpy.mock.calls.length

    // New array with the same content — should NOT refetch.
    rerender({ ids: ['tiny'] })
    await waitFor(() => {
      expect(result.current.status).toBe('ready')
    })
    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirstLoad)
  })
})
