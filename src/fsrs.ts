import { createEmptyCard, fsrs, type Grade, type ReviewLog } from 'ts-fsrs'
import type { AppCard, CardContent } from './types'

const scheduler = fsrs()

export function newCard(content: CardContent, now: Date = new Date()): AppCard {
  return { ...createEmptyCard(now), ...content }
}

export function rate(
  card: AppCard,
  grade: Grade,
  now: Date = new Date(),
): { card: AppCard; log: ReviewLog } {
  const { card: scheduled, log } = scheduler.next(card, now, grade)
  // Preserve content fields; ts-fsrs only knows about FSRS state.
  const { id, deckId, term, definition, category, example } = card
  return {
    card: { ...scheduled, id, deckId, term, definition, category, example },
    log,
  }
}

// Probability the card is still recallable at time `at`, given its stability.
// Useful for sorting due queues — higher retrievability = less urgent.
export function retrievability(card: AppCard, at: Date = new Date()): number {
  if (card.stability <= 0 || !card.last_review) return 1
  const elapsedDays = (at.getTime() - card.last_review.getTime()) / 86_400_000
  return scheduler.forgetting_curve(elapsedDays, card.stability)
}
