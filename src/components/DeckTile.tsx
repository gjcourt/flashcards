import { Link } from 'react-router-dom'
import type { DeckManifestEntry } from '../decks/load'
import type { Deck } from '../types'

type Props = {
  entry: DeckManifestEntry
  deck?: Deck
  dueCount?: number
}

export function DeckTile({ entry, deck, dueCount }: Props) {
  const total = deck?.cards.length
  return (
    <Link
      to={`/decks/${entry.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">{entry.name}</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {entry.description}
          </p>
        </div>
        {dueCount !== undefined && dueCount > 0 && (
          <span className="shrink-0 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            {dueCount} due
          </span>
        )}
      </div>
      {total !== undefined && (
        <div className="mt-3 text-xs text-slate-500 dark:text-slate-500">
          {total} card{total === 1 ? '' : 's'}
        </div>
      )}
    </Link>
  )
}
