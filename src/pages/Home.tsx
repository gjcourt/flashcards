import { useEffect, useState } from 'react'
import { fetchAllDecks } from '../decks/load'
import { useManifest } from '../decks/hooks'
import { useCardStates } from '../state'
import { buildDueQueue } from '../queue'
import { DeckTile } from '../components/DeckTile'
import type { Deck } from '../types'

export function Home() {
  const manifest = useManifest()
  const cardStates = useCardStates()
  const [decks, setDecks] = useState<Deck[] | null>(null)
  const [error, setError] = useState<Error | null>(null)

  // Fetch all decks once so we can show due-counts on tiles.
  useEffect(() => {
    let cancelled = false
    fetchAllDecks()
      .then((d) => {
        if (!cancelled) setDecks(d)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e as Error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (manifest.status === 'loading' || (!decks && !error)) {
    return <p className="text-slate-500">Loading…</p>
  }
  if (manifest.status === 'error' || error) {
    const e = manifest.status === 'error' ? manifest.error : error
    return (
      <p className="text-rose-600 dark:text-rose-400">
        Failed to load decks: {e?.message}
      </p>
    )
  }

  const decksById = new Map(decks!.map((d) => [d.id, d]))
  const now = new Date()

  return (
    <section>
      <h2 className="mb-1 text-2xl font-semibold tracking-tight">Decks</h2>
      <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
        Pick a deck to start a review session.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {manifest.data.decks.map((entry) => {
          const deck = decksById.get(entry.id)
          const dueCount = deck
            ? buildDueQueue(deck.cards, cardStates, now).length
            : undefined
          return (
            <DeckTile
              key={entry.id}
              entry={entry}
              deck={deck}
              dueCount={dueCount}
            />
          )
        })}
      </div>
    </section>
  )
}
