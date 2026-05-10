import { describe, it, expect } from 'vitest'
import { Rating, State } from 'ts-fsrs'
import { rate } from './fsrs'
import { materialise } from './decks/load'
import { fsrsOf } from './storage'
import { masteryBreakdown, nextDueAt, streak } from './stats'

const t0 = new Date('2026-01-01T12:00:00Z')

const deck = materialise(
  {
    id: 'd',
    name: 'D',
    description: '',
    cards: [
      { id: 'a', term: 'A', definition: 'a', category: 'x' },
      { id: 'b', term: 'B', definition: 'b', category: 'x' },
      { id: 'c', term: 'C', definition: 'c', category: 'x' },
    ],
  },
  t0,
)

describe('masteryBreakdown', () => {
  it('counts every card as new when nothing is rated', () => {
    expect(masteryBreakdown(deck.cards, {})).toEqual({
      new: 3,
      learning: 0,
      review: 0,
      mastered: 0,
    })
  })

  it('moves rated card out of New', () => {
    const rated = rate(deck.cards[0]!, Rating.Good, t0).card
    const states = { [rated.id]: fsrsOf(rated) }
    const m = masteryBreakdown(deck.cards, states)
    expect(m.new).toBe(2)
    // Could be Learning or Review depending on ts-fsrs init steps; not New is what we assert.
    expect(m.learning + m.review + m.mastered).toBe(1)
  })

  it('classifies very high stability as mastered', () => {
    // Synthetic state with stability >> threshold and Review state.
    const states = {
      'd:a': {
        ...fsrsOf(deck.cards[0]!),
        state: State.Review,
        stability: 365,
        last_review: t0,
      },
    }
    expect(masteryBreakdown(deck.cards, states)).toMatchObject({ mastered: 1, new: 2 })
  })
})

describe('streak', () => {
  it('returns 0 for empty log', () => {
    expect(streak([], t0)).toBe(0)
  })

  it('returns 0 if there is no review today', () => {
    const yesterday = t0.getTime() - 86_400_000
    expect(streak([{ cardId: 'x', ratedAt: yesterday, rating: Rating.Good }], t0)).toBe(0)
  })

  it('counts consecutive days back from today', () => {
    const today = t0.getTime()
    const yesterday = today - 86_400_000
    const dayBefore = today - 2 * 86_400_000
    const skipped = today - 4 * 86_400_000 // gap → streak ends
    const reviews = [
      { cardId: 'x', ratedAt: skipped, rating: Rating.Good },
      { cardId: 'x', ratedAt: dayBefore, rating: Rating.Good },
      { cardId: 'x', ratedAt: yesterday, rating: Rating.Good },
      { cardId: 'x', ratedAt: today, rating: Rating.Good },
    ]
    expect(streak(reviews, t0)).toBe(3)
  })

  it('multiple reviews on the same day count once', () => {
    const today = t0.getTime()
    const reviews = [
      { cardId: 'x', ratedAt: today, rating: Rating.Good },
      { cardId: 'y', ratedAt: today + 1000, rating: Rating.Hard },
      { cardId: 'z', ratedAt: today + 2000, rating: Rating.Easy },
    ]
    expect(streak(reviews, t0)).toBe(1)
  })
})

describe('nextDueAt', () => {
  it('returns null when every card is new', () => {
    expect(nextDueAt(deck.cards, {}, t0)).toBeNull()
  })

  it('returns the earliest future due across non-new cards', () => {
    const a = rate(deck.cards[0]!, Rating.Easy, t0).card // far future
    const b = rate(deck.cards[1]!, Rating.Hard, t0).card // sooner
    const states = { [a.id]: fsrsOf(a), [b.id]: fsrsOf(b) }
    const next = nextDueAt(deck.cards, states, t0)
    expect(next).not.toBeNull()
    expect(next!.getTime()).toBe(b.due.getTime())
  })

  it('skips cards whose due is in the past (those would already be in the queue)', () => {
    const reviewed = rate(deck.cards[0]!, Rating.Good, t0).card
    const states = { [reviewed.id]: fsrsOf(reviewed) }
    const farFuture = new Date(reviewed.due.getTime() + 86_400_000 * 30)
    expect(nextDueAt(deck.cards, states, farFuture)).toBeNull()
  })
})
