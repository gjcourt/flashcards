import type { Card as FSRSCard, Rating } from 'ts-fsrs'

export type CardContent = {
  id: string
  deckId: string
  term: string
  definition: string
  category: string
  example?: string
}

export type AppCard = FSRSCard & CardContent

export type Deck = {
  id: string
  name: string
  description: string
  cards: AppCard[]
}

export type Collection = {
  id: string
  name: string
  deckIds: string[]
  createdAt: number
  // Optional sync metadata. Older entries persisted before the sync layer
  // landed may lack these; consumers must treat them as optional and default
  // to `createdAt` / `null` respectively.
  updatedAt?: number
  deletedAt?: number | null
}

export type ReviewLogEntry = {
  cardId: string
  ratedAt: number // Unix ms
  rating: Rating
}
