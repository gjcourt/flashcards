import type { AppCard, Collection, Deck } from './types'

export type CardFSRSFields = Omit<
  AppCard,
  'id' | 'deckId' | 'term' | 'definition' | 'category' | 'example'
>

export type CardStateMap = Record<string, CardFSRSFields>

const KEY_CARDS = 'flashcards:cards'
const KEY_COLLECTIONS = 'flashcards:collections'

const DATE_KEYS = new Set(['due', 'last_review'])

function reviveDates(key: string, value: unknown): unknown {
  if (DATE_KEYS.has(key) && typeof value === 'string') {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d
  }
  return value
}

function read<T>(key: string, fallback: T, validate: (v: unknown) => boolean): T {
  if (typeof localStorage === 'undefined') return fallback
  const raw = localStorage.getItem(key)
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw, reviveDates)
    return validate(parsed) ? (parsed as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

export function loadCardStates(): CardStateMap {
  return read<CardStateMap>(KEY_CARDS, {}, (v) => !!v && typeof v === 'object')
}

export function saveCardStates(states: CardStateMap): void {
  write(KEY_CARDS, states)
}

export function loadCollections(): Collection[] {
  return read<Collection[]>(KEY_COLLECTIONS, [], Array.isArray)
}

export function saveCollections(collections: Collection[]): void {
  write(KEY_COLLECTIONS, collections)
}

// Extract just the FSRS-related fields from a card.
export function fsrsOf(card: AppCard): CardFSRSFields {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, deckId, term, definition, category, example, ...rest } = card
  return rest
}

// Overlay stored FSRS state onto a freshly-loaded deck. Cards without stored
// state keep their default new-card values from materialise().
export function applyCardStates(deck: Deck, states: CardStateMap): Deck {
  return {
    ...deck,
    cards: deck.cards.map((card) => {
      const stored = states[card.id]
      return stored ? { ...card, ...stored } : card
    }),
  }
}

// Snapshot the FSRS state of a deck's cards back into a map. Use this to merge
// fresh ratings into the global state map before writing to localStorage.
export function snapshotCardStates(deck: Deck): CardStateMap {
  const out: CardStateMap = {}
  for (const card of deck.cards) out[card.id] = fsrsOf(card)
  return out
}
