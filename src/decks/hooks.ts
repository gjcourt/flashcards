import { useEffect, useState } from 'react'
import { fetchDeck, fetchManifest, type DeckManifest, type DeckManifestEntry } from './load'
import type { Deck } from '../types'

// Memoise the manifest fetch at module scope. The manifest is a static asset;
// re-fetching on every route change is wasted bandwidth. resetManifestCache()
// is exported for tests that swap the global fetch mock between cases.
let manifestPromise: Promise<DeckManifest> | null = null

function getManifest(): Promise<DeckManifest> {
  if (!manifestPromise) {
    manifestPromise = fetchManifest().catch((e) => {
      // On failure, drop the cached rejection so a future call can retry.
      manifestPromise = null
      throw e
    })
  }
  return manifestPromise
}

export function resetManifestCache(): void {
  manifestPromise = null
}

type Async<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: null; error: Error }

const loading = { status: 'loading', data: null, error: null } as const

export function useManifest(): Async<DeckManifest> {
  const [s, set] = useState<Async<DeckManifest>>(loading)
  useEffect(() => {
    let cancelled = false
    getManifest()
      .then((data) => {
        if (!cancelled) set({ status: 'ready', data, error: null })
      })
      .catch((e: unknown) => {
        if (!cancelled) set({ status: 'error', data: null, error: e as Error })
      })
    return () => {
      cancelled = true
    }
  }, [])
  return s
}

export function useDeck(id: string | undefined): Async<Deck> {
  const [s, set] = useState<Async<Deck>>(loading)
  useEffect(() => {
    if (!id) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset stale data when id prop changes
    set(loading)
    getManifest()
      .then((m) => {
        const entry = m.decks.find((e: DeckManifestEntry) => e.id === id)
        if (!entry) throw new Error(`Deck not found: ${id}`)
        return fetchDeck(entry)
      })
      .then((data) => {
        if (!cancelled) set({ status: 'ready', data, error: null })
      })
      .catch((e: unknown) => {
        if (!cancelled) set({ status: 'error', data: null, error: e as Error })
      })
    return () => {
      cancelled = true
    }
  }, [id])
  return s
}

// Load multiple decks at once. Used by the collection-review and /all routes.
// Pass an empty array (or omit ids on /all) to load every deck in the manifest.
// Returns a stable list ordered to match the input ids when supplied; otherwise
// follows manifest order.
export function useDecks(ids: string[] | null): Async<Deck[]> {
  const [s, set] = useState<Async<Deck[]>>(loading)
  // Stable cache key so changing array identity (but same contents) doesn't
  // refetch.
  const idKey = ids === null ? '*' : [...ids].sort().join(',')
  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on input change
    set(loading)
    getManifest()
      .then((m) => {
        const wanted = ids === null ? m.decks : m.decks.filter((e) => ids.includes(e.id))
        if (ids !== null && wanted.length !== ids.length) {
          const missing = ids.filter((id) => !m.decks.some((e) => e.id === id))
          throw new Error(`Deck(s) not found: ${missing.join(', ')}`)
        }
        return Promise.all(wanted.map(fetchDeck))
      })
      .then((data) => {
        if (!cancelled) set({ status: 'ready', data, error: null })
      })
      .catch((e: unknown) => {
        if (!cancelled) set({ status: 'error', data: null, error: e as Error })
      })
    return () => {
      cancelled = true
    }
  }, [idKey, ids])
  return s
}
