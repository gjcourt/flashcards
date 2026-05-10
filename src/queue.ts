import { useMemo } from 'react'
import { State } from 'ts-fsrs'
import { retrievability } from './fsrs'
import type { CardStateMap } from './storage'
import type { AppCard } from './types'

// Build a due queue from a list of (already-materialised) cards by overlaying
// the latest stored FSRS state and sorting:
//   - cards with due <= now first, sorted by retrievability ascending
//     (most overdue → most likely to be forgotten first)
//   - then New cards in their input order
export function buildDueQueue(cards: AppCard[], cardStates: CardStateMap, now: Date): AppCard[] {
  const merged = cards.map((c) => {
    const stored = cardStates[c.id]
    return stored ? { ...c, ...stored } : c
  })

  const due = merged.filter((c) => c.state !== State.New && c.due.getTime() <= now.getTime())
  const fresh = merged.filter((c) => c.state === State.New)

  due.sort((a, b) => retrievability(a, now) - retrievability(b, now))

  return [...due, ...fresh]
}

export function useDueQueue(
  cards: AppCard[],
  cardStates: CardStateMap,
  now: Date = new Date(),
): AppCard[] {
  // `now` changes on every render unless caller memoises it; that's fine —
  // the queue is cheap to rebuild and the time floor matters for "due today".
  // We round to the minute to avoid thrashing on every paint.
  const flooredNow = useMemo(() => new Date(Math.floor(now.getTime() / 60_000) * 60_000), [now])
  return useMemo(
    () => buildDueQueue(cards, cardStates, flooredNow),
    [cards, cardStates, flooredNow],
  )
}
