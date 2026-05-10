import { z } from 'zod'

export const CardStateMutation = z.object({
  id: z.string().min(1),
  // Opaque FSRS state. We only peek at `last_review` for LWW comparison.
  fsrs: z.record(z.unknown()),
})
export type CardStateMutation = z.infer<typeof CardStateMutation>

export const CollectionMutation = z.object({
  id: z.string().min(1),
  name: z.string(),
  deckIds: z.array(z.string()),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().nullable().optional(),
})
export type CollectionMutation = z.infer<typeof CollectionMutation>

export const ReviewMutation = z.object({
  cardId: z.string().min(1),
  ratedAt: z.number().int().nonnegative(),
  // ts-fsrs Rating: 0=Manual, 1=Again, 2=Hard, 3=Good, 4=Easy.
  rating: z.number().int().min(0).max(4),
})
export type ReviewMutation = z.infer<typeof ReviewMutation>

export const SyncRequest = z.object({
  since: z.number().int().nonnegative(),
  mutations: z
    .object({
      cardStates: z.array(CardStateMutation).default([]),
      collections: z.array(CollectionMutation).default([]),
      reviews: z.array(ReviewMutation).default([]),
    })
    .default({ cardStates: [], collections: [], reviews: [] }),
})
export type SyncRequest = z.infer<typeof SyncRequest>

export interface CardStateRow {
  id: string
  fsrs: unknown
  updatedAt: number
}

export interface CollectionRow {
  id: string
  name: string
  deckIds: string[]
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface ReviewRow {
  cardId: string
  ratedAt: number
  rating: number
}

export interface SyncResponse {
  now: number
  cardStates: CardStateRow[]
  collections: CollectionRow[]
  reviews: ReviewRow[]
}
