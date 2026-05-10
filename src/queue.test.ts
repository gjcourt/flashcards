import { describe, it, expect } from 'vitest'
import { Rating } from 'ts-fsrs'
import { rate } from './fsrs'
import { materialise } from './decks/load'
import { fsrsOf } from './storage'
import { buildDueQueue } from './queue'

const t0 = new Date('2026-01-01T00:00:00Z')

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

describe('buildDueQueue', () => {
  it('returns all cards as-is when none have been rated (all New)', () => {
    const queue = buildDueQueue(deck.cards, {}, t0)
    expect(queue.map((c) => c.id)).toEqual(['d:a', 'd:b', 'd:c'])
  })

  it('excludes Review cards whose due date is in the future', () => {
    // Rate one card Good → it gets a future due date → drops out of today's queue.
    const futureRated = rate(deck.cards[0]!, Rating.Good, t0).card
    const states = { [futureRated.id]: fsrsOf(futureRated) }
    const queue = buildDueQueue(deck.cards, states, t0)
    expect(queue.map((c) => c.id)).toEqual(['d:b', 'd:c']) // a is no longer due
  })

  it('puts overdue Review cards before New cards', () => {
    // Rate a card, then advance time past its due date so it's overdue.
    const reviewed = rate(deck.cards[0]!, Rating.Good, t0).card
    const states = { [reviewed.id]: fsrsOf(reviewed) }
    const farFuture = new Date(reviewed.due.getTime() + 86_400_000 * 30)
    const queue = buildDueQueue(deck.cards, states, farFuture)
    expect(queue[0]!.id).toBe('d:a') // overdue Review card surfaces first
    expect(queue.slice(1).map((c) => c.id)).toEqual(['d:b', 'd:c'])
  })

  it('orders multiple overdue cards by retrievability ascending', () => {
    // Rate two cards differently so they have different stabilities, then
    // wait long enough that both are overdue. Lower retrievability sorts first.
    const a = rate(deck.cards[0]!, Rating.Easy, t0).card // higher stability
    const b = rate(deck.cards[1]!, Rating.Hard, t0).card // lower stability
    const states = { [a.id]: fsrsOf(a), [b.id]: fsrsOf(b) }
    const farFuture = new Date(t0.getTime() + 86_400_000 * 365)
    const queue = buildDueQueue(deck.cards, states, farFuture)
    // b should come first — lower stability decays faster → lower retrievability.
    expect(queue[0]!.id).toBe('d:b')
  })
})
