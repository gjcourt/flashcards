import { Link } from 'react-router-dom'
import { useDecks } from '../decks/hooks'
import { ReviewSession } from '../components/ReviewSession'
import type { AppCard } from '../types'

type Props = {
  /** Deck ids to merge for review. Pass `null` for "every bundled deck". */
  deckIds: string[] | null
  title: string
  description?: string
}

// Shared review screen for any merged-deck queue: a saved Collection or the
// "all decks" pseudo-collection. The single-deck route uses <DeckReview>
// directly because it shows extra deck-only chrome (browse cards link).
export function MultiDeckReview({ deckIds, title, description }: Props) {
  const decks = useDecks(deckIds)

  if (decks.status === 'loading') {
    return <p className="text-slate-500">Loading…</p>
  }
  if (decks.status === 'error') {
    return (
      <p className="text-rose-600 dark:text-rose-400">
        Failed to load decks: {decks.error.message}
      </p>
    )
  }

  const allCards: AppCard[] = decks.data.flatMap((d) => d.cards)
  const totalCards = allCards.length
  const sourceLabel = decks.data.length === 1 ? decks.data[0]!.name : `${decks.data.length} decks`

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            {sourceLabel} · {totalCards} card{totalCards === 1 ? '' : 's'}
          </p>
        </div>
        <Link
          to="/"
          className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          ← Home
        </Link>
      </div>
      <ReviewSession cards={allCards} />
    </div>
  )
}
