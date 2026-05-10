import type { Card as FSRSCard } from 'ts-fsrs'

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
