import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDeck, useManifest } from './hooks'

const manifest = {
  decks: [
    {
      id: 'tiny',
      name: 'Tiny',
      description: 'Just a couple cards.',
      path: 'decks/tiny.json',
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input)
      if (url.endsWith('decks/manifest.json')) return jsonResponse(manifest)
      if (url.endsWith('decks/tiny.json')) return jsonResponse(tinyDeck)
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
    expect(result.current.data?.decks).toHaveLength(1)
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
