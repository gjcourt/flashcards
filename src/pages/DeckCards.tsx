import { Link, useParams } from 'react-router-dom'
import { useDeck } from '../decks/hooks'

export function DeckCards() {
  const { id } = useParams<{ id: string }>()
  if (!id) throw new Error('DeckCards rendered without :id route param')
  const deck = useDeck(id)

  if (deck.status === 'loading') {
    return <p className="text-slate-500">Loading deck…</p>
  }
  if (deck.status === 'error') {
    return (
      <p className="text-rose-600 dark:text-rose-400">Failed to load deck: {deck.error.message}</p>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{deck.data.name} · cards</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {deck.data.cards.length} cards in this deck
          </p>
        </div>
        <Link
          to={`/decks/${deck.data.id}`}
          className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          ← Back to review
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2 font-medium">Term</th>
              <th className="px-4 py-2 font-medium">Definition</th>
              <th className="px-4 py-2 font-medium">Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {deck.data.cards.map((card) => (
              <tr key={card.id}>
                <td className="px-4 py-2 font-medium">{card.term}</td>
                <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                  {card.definition}
                  {card.example && (
                    <div className="mt-1 text-xs italic text-slate-500">e.g. {card.example}</div>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-500">{card.category}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
