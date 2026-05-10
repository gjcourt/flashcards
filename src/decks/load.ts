import { newCard } from '../fsrs'
import type { Deck } from '../types'

export type DeckManifestEntry = {
  id: string
  name: string
  description: string
  path: string
}

export type DeckManifest = {
  decks: DeckManifestEntry[]
}

type CardJSON = {
  id: string
  term: string
  definition: string
  category: string
  example?: string
}

type DeckJSON = {
  id: string
  name: string
  description: string
  cards: CardJSON[]
}

const MANIFEST_PATH = 'decks/manifest.json'

function url(relative: string): string {
  const base = import.meta.env.BASE_URL ?? '/'
  return `${base.replace(/\/$/, '')}/${relative.replace(/^\//, '')}`
}

function isCardJSON(value: unknown): value is CardJSON {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.term === 'string' &&
    typeof v.definition === 'string' &&
    typeof v.category === 'string' &&
    (v.example === undefined || typeof v.example === 'string')
  )
}

function isDeckJSON(value: unknown): value is DeckJSON {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.description === 'string' &&
    Array.isArray(v.cards) &&
    v.cards.every(isCardJSON)
  )
}

function isManifest(value: unknown): value is DeckManifest {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.decks)) return false
  return v.decks.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const e = entry as Record<string, unknown>
    return (
      typeof e.id === 'string' &&
      typeof e.name === 'string' &&
      typeof e.description === 'string' &&
      typeof e.path === 'string'
    )
  })
}

async function fetchJSON(path: string): Promise<unknown> {
  const res = await fetch(url(path))
  if (!res.ok) {
    throw new Error(`Failed to fetch ${path}: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

export async function fetchManifest(): Promise<DeckManifest> {
  const raw = await fetchJSON(MANIFEST_PATH)
  if (!isManifest(raw)) throw new Error(`Invalid manifest at ${MANIFEST_PATH}`)
  return raw
}

export async function fetchDeck(entry: DeckManifestEntry): Promise<Deck> {
  const raw = await fetchJSON(entry.path)
  if (!isDeckJSON(raw)) throw new Error(`Invalid deck at ${entry.path}`)
  if (raw.id !== entry.id) {
    throw new Error(
      `Deck id mismatch: manifest says "${entry.id}" but file says "${raw.id}"`,
    )
  }
  return materialise(raw)
}

export async function fetchAllDecks(): Promise<Deck[]> {
  const manifest = await fetchManifest()
  return Promise.all(manifest.decks.map(fetchDeck))
}

// Materialise a JSON deck into runtime form: prefix card ids with the deck id,
// stamp deckId, and initialise FSRS state with newCard.
export function materialise(json: DeckJSON, now: Date = new Date()): Deck {
  return {
    id: json.id,
    name: json.name,
    description: json.description,
    cards: json.cards.map((c) =>
      newCard(
        {
          id: `${json.id}:${c.id}`,
          deckId: json.id,
          term: c.term,
          definition: c.definition,
          category: c.category,
          example: c.example,
        },
        now,
      ),
    ),
  }
}
