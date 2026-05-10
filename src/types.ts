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
}

export type ReviewLogEntry = {
  cardId: string
  ratedAt: number // Unix ms
  rating: Rating
}
