import { describe, it, expect } from 'vitest'
import { State } from 'ts-fsrs'
import { materialise } from './load'

const t0 = new Date('2026-01-01T00:00:00Z')

const json = {
  id: 'nato',
  name: 'NATO Phonetic',
  description: 'Letter codewords',
  cards: [
    { id: 'a', term: 'A', definition: 'Alfa', category: 'letters' },
    {
      id: 'b',
      term: 'B',
      definition: 'Bravo',
      category: 'letters',
      example: 'Bravo Romeo',
    },
  ],
}

describe('materialise', () => {
  it('prefixes card ids with the deck id and stamps deckId', () => {
    const deck = materialise(json, t0)
    expect(deck.cards[0]!.id).toBe('nato:a')
    expect(deck.cards[0]!.deckId).toBe('nato')
    expect(deck.cards[1]!.id).toBe('nato:b')
  })

  it('preserves content fields', () => {
    const deck = materialise(json, t0)
    expect(deck.cards[1]!.term).toBe('B')
    expect(deck.cards[1]!.definition).toBe('Bravo')
    expect(deck.cards[1]!.example).toBe('Bravo Romeo')
  })

  it('initialises every card in New state with reps=0', () => {
    const deck = materialise(json, t0)
    for (const card of deck.cards) {
      expect(card.state).toBe(State.New)
      expect(card.reps).toBe(0)
    }
  })

  it('preserves deck metadata', () => {
    const deck = materialise(json, t0)
    expect(deck.id).toBe('nato')
    expect(deck.name).toBe('NATO Phonetic')
    expect(deck.description).toBe('Letter codewords')
  })
})
