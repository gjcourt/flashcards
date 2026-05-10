import { State } from 'ts-fsrs'
import type { CardStateMap } from './storage'
import type { AppCard, ReviewLogEntry } from './types'

const DAY_MS = 86_400_000

// Stability threshold (in days) above which a card counts as "mastered".
// FSRS-4.5 default request_retention is 0.9 — at stability=30d, retrievability
// after 30 days has decayed to ~70%. Anything past that is well-learned.
const MASTERED_STABILITY_DAYS = 30

export type Mastery = {
  new: number
  learning: number
  review: number
  mastered: number
}

// Bucket cards into mastery levels for the stats panel. Card content is
// merged with stored FSRS state before bucketing so stale defaults don't
// pollute the count.
export function masteryBreakdown(cards: AppCard[], states: CardStateMap): Mastery {
  const out: Mastery = { new: 0, learning: 0, review: 0, mastered: 0 }
  for (const card of cards) {
    const stored = states[card.id]
    const merged = stored ? { ...card, ...stored } : card
    if (merged.state === State.New) {
      out.new++
    } else if (merged.state === State.Learning || merged.state === State.Relearning) {
      out.learning++
    } else if (merged.stability >= MASTERED_STABILITY_DAYS) {
      out.mastered++
    } else {
      out.review++
    }
  }
  return out
}

// Floor a Date to the start of its UTC day. Streak counting is in UTC to
// avoid timezone-edge weirdness across midnight.
function dayKey(d: Date | number): number {
  const t = typeof d === 'number' ? d : d.getTime()
  return Math.floor(t / DAY_MS) * DAY_MS
}

// Consecutive days (including today) with ≥1 review entry. Returns 0 if no
// review happened today; doesn't try to look "yesterday's streak forward".
export function streak(reviews: readonly ReviewLogEntry[], now: Date = new Date()): number {
  if (reviews.length === 0) return 0
  const days = new Set<number>()
  for (const r of reviews) days.add(dayKey(r.ratedAt))

  let count = 0
  let day = dayKey(now)
  while (days.has(day)) {
    count++
    day -= DAY_MS
  }
  return count
}

// Earliest future `due` timestamp across the given cards (after merging
// stored state). Returns null if all cards are New (no due date yet) or the
// list is empty.
export function nextDueAt(
  cards: AppCard[],
  states: CardStateMap,
  now: Date = new Date(),
): Date | null {
  let earliest: number | null = null
  for (const card of cards) {
    const stored = states[card.id]
    const merged = stored ? { ...card, ...stored } : card
    if (merged.state === State.New) continue
    const t = merged.due.getTime()
    if (t > now.getTime() && (earliest === null || t < earliest)) earliest = t
  }
  return earliest === null ? null : new Date(earliest)
}
