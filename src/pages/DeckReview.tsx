import { Link, useParams } from 'react-router-dom'
import { useDeck } from '../decks/hooks'
import { ReviewSession } from '../components/ReviewSession'

export function DeckReview() {
  const { id } = useParams<{ id: string }>()
  const deck = useDeck(id)

  if (deck.status === 'loading') {
    return <p className="text-slate-500">Loading deck…</p>
  }
  if (deck.status === 'error') {
    return (
      <p className="text-rose-600 dark:text-rose-400">
        Failed to load deck: {deck.error.message}
      </p>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {deck.data.name}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {deck.data.description}
          </p>
        </div>
        <Link
          to={`/decks/${deck.data.id}/cards`}
          className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          Browse cards →
        </Link>
      </div>
      <ReviewSession cards={deck.data.cards} />
    </div>
  )
}
