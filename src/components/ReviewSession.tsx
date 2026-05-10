import { useEffect, useState } from 'react'
import { Rating } from 'ts-fsrs'
import { useCardStates, useRateCard } from '../state'
import { useDueQueue } from '../queue'
import { nextDueAt } from '../stats'
import type { AppCard } from '../types'
import { CardFlip } from './CardFlip'
import { StatsPanel } from './StatsPanel'

type Props = {
  cards: AppCard[]
  emptyHint?: string
  /** When true, hide the StatsPanel above the review (for tight contexts). */
  hideStats?: boolean
}

const RATINGS = [
  { grade: Rating.Again, label: 'Again', key: '1', tone: 'bg-rose-600 hover:bg-rose-700' },
  { grade: Rating.Hard, label: 'Hard', key: '2', tone: 'bg-amber-600 hover:bg-amber-700' },
  { grade: Rating.Good, label: 'Good', key: '3', tone: 'bg-emerald-600 hover:bg-emerald-700' },
  { grade: Rating.Easy, label: 'Easy', key: '4', tone: 'bg-sky-600 hover:bg-sky-700' },
] as const

const RELATIVE_TIME = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const ABSOLUTE_TIME = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function describeNextDue(at: Date, now: Date): string {
  const ms = at.getTime() - now.getTime()
  const minutes = Math.round(ms / 60_000)
  const hours = Math.round(ms / 3_600_000)
  const days = Math.round(ms / 86_400_000)
  if (Math.abs(days) >= 1) return RELATIVE_TIME.format(days, 'day')
  if (Math.abs(hours) >= 1) return RELATIVE_TIME.format(hours, 'hour')
  return RELATIVE_TIME.format(minutes, 'minute')
}

export function ReviewSession({ cards, emptyHint, hideStats }: Props) {
  const cardStates = useCardStates()
  const queue = useDueQueue(cards, cardStates)
  const current = queue[0]
  const now = new Date()

  if (!current) {
    const next = nextDueAt(cards, cardStates, now)
    return (
      <div className="space-y-6">
        {!hideStats && <StatsPanel cards={cards} cardStates={cardStates} dueCount={0} now={now} />}
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <p className="text-2xl font-semibold">All caught up</p>
          <p className="text-slate-600 dark:text-slate-400">
            {emptyHint ?? 'No cards due right now.'}
          </p>
          {next && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
              Next card due {describeNextDue(next, now)} ·{' '}
              <span className="text-slate-400 dark:text-slate-600">
                {ABSOLUTE_TIME.format(next)}
              </span>
            </p>
          )}
        </div>
      </div>
    )
  }

  // Keyed by card id so flip state resets cleanly when the card changes.
  return (
    <div className="space-y-6">
      {!hideStats && (
        <StatsPanel cards={cards} cardStates={cardStates} dueCount={queue.length} now={now} />
      )}
      <ActiveCard key={current.id} card={current} queueLength={queue.length} />
    </div>
  )
}

function ActiveCard({ card, queueLength }: { card: AppCard; queueLength: number }) {
  const rateCard = useRateCard()
  const [flipped, setFlipped] = useState(false)

  // Keyboard shortcuts: space toggles flip, 1/2/3/4 rates.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        setFlipped((f) => !f)
        return
      }
      if (!flipped) return
      const r = RATINGS.find((x) => x.key === e.key)
      if (r) {
        e.preventDefault()
        rateCard(card, r.grade)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, flipped, rateCard])

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-sm text-slate-500 dark:text-slate-400">
        {queueLength} card{queueLength === 1 ? '' : 's'} in queue
      </div>

      <CardFlip
        flipped={flipped}
        onClick={() => setFlipped((f) => !f)}
        front={
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              {card.category}
            </span>
            <div className="text-3xl font-semibold">{card.term}</div>
          </div>
        }
        back={
          <div className="flex max-h-full flex-col gap-3 overflow-auto text-left">
            <div className="text-base leading-relaxed">{card.definition}</div>
            {card.example && (
              <div className="text-sm italic text-slate-600 dark:text-slate-400">
                e.g. {card.example}
              </div>
            )}
          </div>
        }
      />

      {!flipped ? (
        <button
          type="button"
          onClick={() => setFlipped(true)}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          Show answer <span className="ml-1 text-xs opacity-60">space</span>
        </button>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {RATINGS.map((r) => (
            <button
              type="button"
              key={r.label}
              onClick={() => rateCard(card, r.grade)}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm ${r.tone}`}
            >
              <span>{r.label}</span>
              <span className="text-xs opacity-70">{r.key}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
