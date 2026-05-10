import { describe, it, expect } from 'vitest'
import { Rating, State } from 'ts-fsrs'
import { newCard, rate, retrievability } from './fsrs'
import type { CardContent } from './types'

const content: CardContent = {
  id: 'nato:a',
  deckId: 'nato',
  term: 'A',
  definition: 'Alfa',
  category: 'letters',
  example: 'A as in Alfa',
}

const t0 = new Date('2026-01-01T00:00:00Z')

describe('newCard', () => {
  it('starts in New state with content fields preserved', () => {
    const card = newCard(content, t0)
    expect(card.state).toBe(State.New)
    expect(card.reps).toBe(0)
    expect(card.term).toBe('A')
    expect(card.definition).toBe('Alfa')
    expect(card.deckId).toBe('nato')
  })
})

describe('rate', () => {
  it('preserves content fields after rating', () => {
    const card = newCard(content, t0)
    const { card: next } = rate(card, Rating.Good, t0)
    expect(next.id).toBe('nato:a')
    expect(next.term).toBe('A')
    expect(next.deckId).toBe('nato')
  })

  it('schedules a future due date for Good', () => {
    const card = newCard(content, t0)
    const { card: next } = rate(card, Rating.Good, t0)
    expect(next.due.getTime()).toBeGreaterThan(t0.getTime())
    expect(next.reps).toBe(1)
  })

  it('Easy schedules further out than Good', () => {
    const card = newCard(content, t0)
    const good = rate(card, Rating.Good, t0).card
    const easy = rate(card, Rating.Easy, t0).card
    expect(easy.due.getTime()).toBeGreaterThan(good.due.getTime())
  })

  it('Hard schedules sooner than Good', () => {
    const card = newCard(content, t0)
    const good = rate(card, Rating.Good, t0).card
    const hard = rate(card, Rating.Hard, t0).card
    expect(hard.due.getTime()).toBeLessThan(good.due.getTime())
  })

  it('Again resets to a low-stability lapsed state vs Good', () => {
    // Take a card through Good twice so it leaves the New/Learning phase
    // and accumulates real stability, then compare Again vs Good from there.
    const seed = newCard(content, t0)
    const t1 = new Date('2026-01-02T00:00:00Z')
    const learned = rate(seed, Rating.Good, t0).card
    const reviewed = rate(learned, Rating.Good, t1).card

    const t2 = new Date('2026-01-10T00:00:00Z')
    const again = rate(reviewed, Rating.Again, t2).card
    const good = rate(reviewed, Rating.Good, t2).card

    expect(again.lapses).toBeGreaterThan(reviewed.lapses)
    expect(good.lapses).toBe(reviewed.lapses)
    expect(again.stability).toBeLessThan(good.stability)
  })

  it('emits a ReviewLog with the rating that was applied', () => {
    const card = newCard(content, t0)
    const { log } = rate(card, Rating.Hard, t0)
    expect(log.rating).toBe(Rating.Hard)
  })
})

describe('retrievability', () => {
  it('returns 1 for a brand new card with no stability', () => {
    const card = newCard(content, t0)
    expect(retrievability(card, t0)).toBe(1)
  })

  it('decays as elapsed time exceeds stability', () => {
    const card = newCard(content, t0)
    const reviewed = rate(card, Rating.Good, t0).card

    const justAfter = new Date(reviewed.last_review!.getTime() + 60_000)
    const muchLater = new Date(
      reviewed.last_review!.getTime() + reviewed.stability * 100 * 86_400_000,
    )

    const rNow = retrievability(reviewed, justAfter)
    const rLater = retrievability(reviewed, muchLater)

    // rNow should be near 1 (just reviewed); rLater should have decayed substantially
    expect(rNow).toBeGreaterThan(0.95)
    expect(rNow).toBeGreaterThan(rLater)
    expect(rLater).toBeLessThan(0.5)
  })
})
