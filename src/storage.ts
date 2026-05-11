import type { AppCard, Collection, Deck, ReviewLogEntry } from './types'

export type CardFSRSFields = Omit<
  AppCard,
  'id' | 'deckId' | 'term' | 'definition' | 'category' | 'example'
>

export type CardStateMap = Record<string, CardFSRSFields>

const KEY_CARDS = 'flashcards:cards'
const KEY_COLLECTIONS = 'flashcards:collections'
const KEY_REVIEWS = 'flashcards:reviews'
const KEY_SYNC_QUEUE = 'flashcards:sync-queue'
const KEY_LAST_SYNC_AT = 'flashcards:last-sync-at'

// Review log is capped to bound localStorage growth. ~50 reviews/day × 20 days
// keeps a meaningful streak window without unbounded write cost.
export const REVIEW_LOG_CAP = 1000

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
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    // Quota exceeded, private mode, etc — log and carry on rather than
    // crashing the whole app. Callers that strictly need persistence
    // (sync queue) can fall back to in-memory state.
    console.warn(`flashcards: localStorage write failed for ${key}:`, err)
  }
}

export function loadCardStates(): CardStateMap {
  return read<CardStateMap>(KEY_CARDS, {}, (v) => !!v && typeof v === 'object')
}

export function saveCardStates(states: CardStateMap): void {
  write(KEY_CARDS, states)
}

function isCollection(v: unknown): v is Collection {
  if (!v || typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  if (
    !(
      typeof c.id === 'string' &&
      typeof c.name === 'string' &&
      Array.isArray(c.deckIds) &&
      c.deckIds.every((d) => typeof d === 'string') &&
      typeof c.createdAt === 'number'
    )
  ) {
    return false
  }
  // Optional sync metadata. If present, must be of the right type.
  if (c.updatedAt !== undefined && typeof c.updatedAt !== 'number') return false
  if (c.deletedAt !== undefined && c.deletedAt !== null && typeof c.deletedAt !== 'number')
    return false
  return true
}

export function loadCollections(): Collection[] {
  // Validate the array, then drop any malformed entries rather than failing
  // the entire load — preserves valid user data when one entry has drifted.
  const raw = read<unknown[]>(KEY_COLLECTIONS, [], Array.isArray)
  const valid = raw.filter(isCollection)
  if (valid.length < raw.length) {
    console.warn(
      `flashcards: dropped ${raw.length - valid.length} malformed collection(s) from localStorage`,
    )
  }
  return valid
}

export function saveCollections(collections: Collection[]): void {
  write(KEY_COLLECTIONS, collections)
}

function isReviewLogEntry(v: unknown): v is ReviewLogEntry {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return (
    typeof r.cardId === 'string' && typeof r.ratedAt === 'number' && typeof r.rating === 'number'
  )
}

export function loadReviews(): ReviewLogEntry[] {
  const raw = read<unknown[]>(KEY_REVIEWS, [], Array.isArray)
  return raw.filter(isReviewLogEntry)
}

export function saveReviews(reviews: ReviewLogEntry[]): void {
  write(KEY_REVIEWS, reviews)
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

// ── Sync queue + last-sync-at ────────────────────────────────────────────
// Mutation queue persisted in localStorage. Schema lives in src/sync/types.ts;
// we keep storage.ts ignorant of the discriminated union and just hand it
// an `unknown[]`. Validation happens at the boundary in sync/queue.ts.

export function loadQueueRaw(): unknown[] {
  return read<unknown[]>(KEY_SYNC_QUEUE, [], Array.isArray)
}

export function saveQueueRaw(queue: readonly unknown[]): void {
  write(KEY_SYNC_QUEUE, queue)
}

export function loadLastSyncAt(): number {
  return read<number>(KEY_LAST_SYNC_AT, 0, (v) => typeof v === 'number' && Number.isFinite(v))
}

export function saveLastSyncAt(at: number): void {
  write(KEY_LAST_SYNC_AT, at)
}
