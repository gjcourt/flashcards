import { describe, it, expect, beforeEach } from 'vitest'
import { Rating } from 'ts-fsrs'
import { rate } from './fsrs'
import { materialise } from './decks/load'
import {
  applyCardStates,
  loadCardStates,
  loadCollections,
  saveCardStates,
  saveCollections,
  snapshotCardStates,
} from './storage'
import type { Collection } from './types'

const t0 = new Date('2026-01-01T00:00:00Z')

const deckJSON = {
  id: 'nato',
  name: 'NATO',
  description: '',
  cards: [
    { id: 'a', term: 'A', definition: 'Alfa', category: 'letters' },
    { id: 'b', term: 'B', definition: 'Bravo', category: 'letters' },
  ],
}

beforeEach(() => {
  localStorage.clear()
})

describe('card-state round-trip', () => {
  it('returns empty map when nothing stored', () => {
    expect(loadCardStates()).toEqual({})
  })

  it('persists ratings across simulated reload', () => {
    const fresh = materialise(deckJSON, t0)
    const rated = rate(fresh.cards[0]!, Rating.Good, t0).card
    const updated = { ...fresh, cards: [rated, fresh.cards[1]!] }

    saveCardStates(snapshotCardStates(updated))

    // Simulate reload: re-materialise from JSON, then overlay stored state.
    const reloaded = materialise(deckJSON, t0)
    const restored = applyCardStates(reloaded, loadCardStates())

    expect(restored.cards[0]!.reps).toBe(1)
    expect(restored.cards[0]!.due.getTime()).toBe(rated.due.getTime())
    expect(restored.cards[1]!.reps).toBe(0) // untouched card stays new
  })

  it('revives Date fields on read', () => {
    const fresh = materialise(deckJSON, t0)
    const rated = rate(fresh.cards[0]!, Rating.Good, t0).card
    saveCardStates({ [rated.id]: stripContent(rated) })
    const states = loadCardStates()
    expect(states[rated.id]!.due).toBeInstanceOf(Date)
    expect(states[rated.id]!.last_review).toBeInstanceOf(Date)
  })

  it('falls back to {} on corrupt storage', () => {
    localStorage.setItem('flashcards:cards', 'not json {')
    expect(loadCardStates()).toEqual({})
  })
})

describe('collections', () => {
  it('returns empty array when nothing stored', () => {
    expect(loadCollections()).toEqual([])
  })

  it('round-trips a collection', () => {
    const c: Collection = {
      id: 'interview-prep',
      name: 'Interview Prep',
      deckIds: ['nato', 'latency', 'acronyms'],
      createdAt: t0.getTime(),
    }
    saveCollections([c])
    expect(loadCollections()).toEqual([c])
  })

  it('falls back to [] when stored value is not an array', () => {
    localStorage.setItem('flashcards:collections', '{"not":"an array"}')
    expect(loadCollections()).toEqual([])
  })
})

function stripContent(card: ReturnType<typeof rate> extends { card: infer C } ? C : never) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, deckId, term, definition, category, example, ...rest } = card
  return rest
}
