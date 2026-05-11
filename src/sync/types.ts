// Wire types for POST /api/sync. These mirror server/src/schema.ts exactly
// — but we deliberately do NOT import from `server/` so the web app stays
// self-contained. If the two drift, that's a contract bug to catch in CI.

export type CardStateMutation = {
  id: string
  // Opaque FSRS state. We only peek at `last_review` for LWW comparison.
  fsrs: unknown
}

export type CollectionMutation = {
  id: string
  name: string
  deckIds: string[]
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export type ReviewMutation = {
  cardId: string
  ratedAt: number
  // ts-fsrs Rating: 0=Manual, 1=Again, 2=Hard, 3=Good, 4=Easy.
  rating: number
}

export type SyncMutations = {
  cardStates: CardStateMutation[]
  collections: CollectionMutation[]
  reviews: ReviewMutation[]
}

export type SyncRequest = {
  since: number
  mutations: SyncMutations
}

export type CardStateRow = {
  id: string
  fsrs: unknown
  updatedAt: number
}

export type CollectionRow = {
  id: string
  name: string
  deckIds: string[]
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export type ReviewRow = {
  cardId: string
  ratedAt: number
  rating: number
}

export type SyncResponse = {
  now: number
  cardStates: CardStateRow[]
  collections: CollectionRow[]
  reviews: ReviewRow[]
}

// Queue entries persisted to localStorage. Each one becomes a mutation
// envelope on the next POST /api/sync.
export type QueuedMutation =
  | { kind: 'cardState'; id: string; fsrs: unknown; enqueuedAt: number }
  | {
      kind: 'collection'
      id: string
      name: string
      deckIds: string[]
      createdAt: number
      updatedAt: number
      deletedAt: number | null
      enqueuedAt: number
    }
  | { kind: 'review'; cardId: string; ratedAt: number; rating: number; enqueuedAt: number }
