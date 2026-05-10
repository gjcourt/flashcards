import { Link } from 'react-router-dom'
import { useDecks, useManifest } from '../decks/hooks'
import { useCardStates, useCollections } from '../state'
import { buildDueQueue } from '../queue'
import { DeckTile } from '../components/DeckTile'

export function Home() {
  const manifest = useManifest()
  const decks = useDecks(null) // every deck — used for due counts and total cards
  const cardStates = useCardStates()
  const collections = useCollections()

  if (manifest.status === 'loading' || decks.status === 'loading') {
    return <p className="text-slate-500">Loading…</p>
  }
  if (manifest.status === 'error') {
    return (
      <p className="text-rose-600 dark:text-rose-400">
        Failed to load decks: {manifest.error.message}
      </p>
    )
  }
  if (decks.status === 'error') {
    return (
      <p className="text-rose-600 dark:text-rose-400">
        Failed to load decks: {decks.error.message}
      </p>
    )
  }

  const decksById = new Map(decks.data.map((d) => [d.id, d]))
  const now = new Date()

  function dueAcross(deckIds: readonly string[]): number {
    return deckIds.reduce((sum, id) => {
      const deck = decksById.get(id)
      return deck ? sum + buildDueQueue(deck.cards, cardStates, now).length : sum
    }, 0)
  }

  const allDueCount = dueAcross(manifest.data.decks.map((e) => e.id))
  const totalCards = decks.data.reduce((sum, d) => sum + d.cards.length, 0)

  return (
    <div className="space-y-10">
      {/* Collections + global review */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Collections</h2>
          <Link
            to="/manage"
            className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            Manage →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Always-present "review all" pseudo-collection */}
          <Link
            to="/all"
            className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Review all decks</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Merged due queue across every bundled deck.
                </p>
              </div>
              {allDueCount > 0 && (
                <span className="shrink-0 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                  {allDueCount} due
                </span>
              )}
            </div>
            <div className="mt-3 text-xs text-slate-500">
              {totalCards} card{totalCards === 1 ? '' : 's'}
            </div>
          </Link>

          {collections.map((c) => {
            const due = dueAcross(c.deckIds)
            const total = c.deckIds.reduce(
              (sum, id) => sum + (decksById.get(id)?.cards.length ?? 0),
              0,
            )
            return (
              <Link
                key={c.id}
                to={`/collections/${c.id}`}
                className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">{c.name}</h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {c.deckIds.join(' · ')}
                    </p>
                  </div>
                  {due > 0 && (
                    <span className="shrink-0 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                      {due} due
                    </span>
                  )}
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  {total} card{total === 1 ? '' : 's'} · {c.deckIds.length} deck
                  {c.deckIds.length === 1 ? '' : 's'}
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Individual decks */}
      <section>
        <h2 className="mb-1 text-2xl font-semibold tracking-tight">Decks</h2>
        <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
          Pick a single deck to study on its own.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {manifest.data.decks.map((entry) => {
            const deck = decksById.get(entry.id)
            const dueCount = deck ? buildDueQueue(deck.cards, cardStates, now).length : undefined
            return <DeckTile key={entry.id} entry={entry} deck={deck} dueCount={dueCount} />
          })}
        </div>
      </section>
    </div>
  )
}
