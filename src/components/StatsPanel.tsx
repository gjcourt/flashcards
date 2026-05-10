import { useReviews } from '../state'
import { masteryBreakdown, streak, type Mastery } from '../stats'
import type { CardStateMap } from '../storage'
import type { AppCard } from '../types'

type Props = {
  cards: AppCard[]
  cardStates: CardStateMap
  dueCount: number
  now?: Date
}

// Stats summary shown above a review session. Streak is computed across
// every reviewed card (global), not just cards in the current scope, since
// a streak is a habit-level metric, not a deck-level one.
export function StatsPanel({ cards, cardStates, dueCount, now }: Props) {
  const reviews = useReviews()
  const total = cards.length
  const days = streak(reviews, now)
  const m = masteryBreakdown(cards, cardStates)

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="grid grid-cols-2 gap-y-3 sm:grid-cols-4">
        <Stat label="Streak" value={`${days} day${days === 1 ? '' : 's'}`} />
        <Stat label="Due now" value={String(dueCount)} accent={dueCount > 0} />
        <Stat label="Cards" value={String(total)} />
        <Stat label="Mastered" value={`${m.mastered}/${total}`} />
      </div>
      <Mastery mastery={m} total={total} />
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div
        className={`mt-1 text-base font-semibold ${
          accent ? 'text-rose-600 dark:text-rose-400' : ''
        }`}
      >
        {value}
      </div>
    </div>
  )
}

function Mastery({ mastery, total }: { mastery: Mastery; total: number }) {
  if (total === 0) return null
  // Mastery bar: each segment is one of the 4 buckets, width proportional.
  const segments = [
    { key: 'new', label: 'New', count: mastery.new, color: 'bg-slate-300 dark:bg-slate-700' },
    {
      key: 'learning',
      label: 'Learning',
      count: mastery.learning,
      color: 'bg-amber-500',
    },
    { key: 'review', label: 'Review', count: mastery.review, color: 'bg-sky-500' },
    {
      key: 'mastered',
      label: 'Mastered',
      count: mastery.mastered,
      color: 'bg-emerald-500',
    },
  ]
  return (
    <div className="mt-4">
      <div className="flex h-2 overflow-hidden rounded-full" aria-hidden="true">
        {segments.map((s) =>
          s.count > 0 ? (
            <div key={s.key} className={s.color} style={{ width: `${(s.count / total) * 100}%` }} />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
        {segments.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className={`inline-block size-2 rounded-full ${s.color}`} aria-hidden />
            {s.label} {s.count}
          </span>
        ))}
      </div>
    </div>
  )
}
