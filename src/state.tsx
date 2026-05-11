/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from 'react'
import type { Grade } from 'ts-fsrs'
import { rate } from './fsrs'
import {
  fsrsOf,
  loadCardStates,
  loadCollections,
  loadReviews,
  REVIEW_LOG_CAP,
  saveCardStates,
  saveCollections,
  saveReviews,
  type CardFSRSFields,
  type CardStateMap,
} from './storage'
import { useSync, type SyncStatus } from './state-sync'
import { reconcile } from './sync/reconcile'
import type { QueuedMutation, SyncResponse } from './sync/types'
import type { AppCard, Collection, ReviewLogEntry } from './types'

type State = {
  cardStates: CardStateMap
  collections: Collection[]
  reviews: ReviewLogEntry[]
}

type Action =
  | { type: 'RATE_CARD'; cardId: string; fsrs: CardFSRSFields; entry: ReviewLogEntry }
  | { type: 'ADD_COLLECTION'; collection: Collection }
  | { type: 'DELETE_COLLECTION'; id: string; deletedAt: number }
  | { type: 'RESET_PROGRESS' }
  | { type: 'RECONCILE'; response: SyncResponse }

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'RATE_CARD': {
      // Append to the review log, capped at REVIEW_LOG_CAP. Older entries
      // drop off the front so storage can't grow unbounded.
      const reviews = [...s.reviews, a.entry]
      if (reviews.length > REVIEW_LOG_CAP) reviews.splice(0, reviews.length - REVIEW_LOG_CAP)
      return {
        ...s,
        cardStates: { ...s.cardStates, [a.cardId]: a.fsrs },
        reviews,
      }
    }
    case 'ADD_COLLECTION':
      return {
        ...s,
        collections: [...s.collections.filter((c) => c.id !== a.collection.id), a.collection],
      }
    case 'DELETE_COLLECTION':
      return { ...s, collections: s.collections.filter((c) => c.id !== a.id) }
    case 'RESET_PROGRESS':
      return { ...s, cardStates: {}, reviews: [] }
    case 'RECONCILE': {
      const merged = reconcile(
        { cardStates: s.cardStates, collections: s.collections, reviews: s.reviews },
        a.response,
      )
      return {
        cardStates: merged.cardStates,
        collections: merged.collections,
        reviews: merged.reviews,
      }
    }
    default: {
      const _exhaustive: never = a
      throw new Error(`Unhandled action: ${JSON.stringify(_exhaustive)}`)
    }
  }
}

// Synchronous initial-state computation — reads localStorage during the
// first reducer init so there is no asynchronous "empty then hydrated"
// window where a user rating could be clobbered by a late hydrate.
function init(): State {
  return {
    cardStates: loadCardStates(),
    collections: loadCollections(),
    reviews: loadReviews(),
  }
}

const StateContext = createContext<{
  state: State
  dispatch: Dispatch<Action>
} | null>(null)

const SyncStatusContext = createContext<SyncStatus | null>(null)

type StateProviderProps = {
  children: ReactNode
  // Test injection points so the sync layer can be steered without spinning
  // up real timers or a real fetch. Production callers leave these unset.
  syncFetch?: typeof fetch
  syncIntervalMs?: number
  syncOnMount?: boolean
  // Set to true (default) to mount the sync layer. Tests for non-sync
  // behaviour can disable it to keep the surface small.
  enableSync?: boolean
}

export function StateProvider({
  children,
  syncFetch,
  syncIntervalMs,
  syncOnMount,
  enableSync = true,
}: StateProviderProps) {
  const [state, dispatch] = useReducer(reducer, undefined, init)

  // Skip the very first persist for each slice — the values just read in
  // init() don't need to be written back. Subsequent changes flow to disk.
  const skipCardsWrite = useRef(true)
  const skipCollectionsWrite = useRef(true)
  const skipReviewsWrite = useRef(true)

  useEffect(() => {
    if (skipCardsWrite.current) {
      skipCardsWrite.current = false
      return
    }
    saveCardStates(state.cardStates)
  }, [state.cardStates])

  useEffect(() => {
    if (skipCollectionsWrite.current) {
      skipCollectionsWrite.current = false
      return
    }
    saveCollections(state.collections)
  }, [state.collections])

  useEffect(() => {
    if (skipReviewsWrite.current) {
      skipReviewsWrite.current = false
      return
    }
    saveReviews(state.reviews)
  }, [state.reviews])

  const value = useMemo(() => ({ state, dispatch }), [state])

  return (
    <StateContext.Provider value={value}>
      {enableSync ? (
        <SyncLayer
          dispatch={dispatch}
          fetchImpl={syncFetch}
          intervalMs={syncIntervalMs}
          syncOnMount={syncOnMount}
        >
          {children}
        </SyncLayer>
      ) : (
        <SyncStatusContext.Provider
          value={{ state: 'offline', lastSyncAt: null, errorMessage: null }}
        >
          {children}
        </SyncStatusContext.Provider>
      )}
    </StateContext.Provider>
  )
}

// ── Sync wiring ──────────────────────────────────────────────────────────
// The sync layer is mounted as a child of StateProvider so it has access to
// the reducer's dispatch. Mutations dispatched through the wrapped dispatch
// enqueue a mutation envelope; the periodic loop drains it.

const EnqueueContext = createContext<((m: QueuedMutation) => void) | null>(null)
const ClearQueueContext = createContext<(() => void) | null>(null)

type SyncLayerProps = {
  dispatch: Dispatch<Action>
  fetchImpl?: typeof fetch
  intervalMs?: number
  syncOnMount?: boolean
  children: ReactNode
}

function SyncLayer({ dispatch, fetchImpl, intervalMs, syncOnMount, children }: SyncLayerProps) {
  const onResponse = useCallback(
    (response: SyncResponse) => {
      dispatch({ type: 'RECONCILE', response })
    },
    [dispatch],
  )

  const { enqueue, clearQueue, status } = useSync({
    onResponse,
    fetchImpl,
    intervalMs,
    syncOnMount,
  })

  return (
    <SyncStatusContext.Provider value={status}>
      <EnqueueContext.Provider value={enqueue}>
        <ClearQueueContext.Provider value={clearQueue}>{children}</ClearQueueContext.Provider>
      </EnqueueContext.Provider>
    </SyncStatusContext.Provider>
  )
}

function useStateContext() {
  const ctx = useContext(StateContext)
  if (!ctx) throw new Error('useStateContext must be used inside <StateProvider>')
  return ctx
}

// Internal helper: returns a no-op when sync is disabled (e.g. in tests).
function useEnqueue(): (m: QueuedMutation) => void {
  return useContext(EnqueueContext) ?? noopEnqueue
}

function useClearQueue(): () => void {
  return useContext(ClearQueueContext) ?? noopClear
}

function noopEnqueue() {
  /* sync disabled */
}
function noopClear() {
  /* sync disabled */
}

export function useSyncStatus(): SyncStatus {
  return useContext(SyncStatusContext) ?? { state: 'offline', lastSyncAt: null, errorMessage: null }
}

export function useCardStates(): CardStateMap {
  return useStateContext().state.cardStates
}

export function useCollections(): Collection[] {
  return useStateContext().state.collections
}

export function useReviews(): ReviewLogEntry[] {
  return useStateContext().state.reviews
}

export function useRateCard() {
  const { dispatch } = useStateContext()
  const enqueue = useEnqueue()
  return useCallback(
    (card: AppCard, grade: Grade, now?: Date): AppCard => {
      const { card: next, log } = rate(card, grade, now)
      const fsrs = fsrsOf(next)
      const entry: ReviewLogEntry = {
        cardId: card.id,
        ratedAt: log.review.getTime(),
        rating: log.rating,
      }
      dispatch({ type: 'RATE_CARD', cardId: card.id, fsrs, entry })
      const enqueuedAt = Date.now()
      enqueue({ kind: 'cardState', id: card.id, fsrs, enqueuedAt })
      enqueue({
        kind: 'review',
        cardId: entry.cardId,
        ratedAt: entry.ratedAt,
        rating: entry.rating,
        enqueuedAt,
      })
      return next
    },
    [dispatch, enqueue],
  )
}

/**
 * Add a collection. **Overwrites** any existing collection with the same id.
 * Callers are expected to enforce id uniqueness in UI (see Manage's idTaken check).
 */
export function useAddCollection() {
  const { dispatch } = useStateContext()
  const enqueue = useEnqueue()
  return useCallback(
    (collection: Collection) => {
      const now = Date.now()
      // Stamp sync metadata if the caller didn't provide it. Existing call
      // sites (Manage) pass only `createdAt`; the rest defaults sensibly.
      const stamped: Collection = {
        ...collection,
        updatedAt: collection.updatedAt ?? now,
        deletedAt: collection.deletedAt ?? null,
      }
      dispatch({ type: 'ADD_COLLECTION', collection: stamped })
      enqueue({
        kind: 'collection',
        id: stamped.id,
        name: stamped.name,
        deckIds: stamped.deckIds,
        createdAt: stamped.createdAt,
        updatedAt: stamped.updatedAt ?? now,
        deletedAt: stamped.deletedAt ?? null,
        enqueuedAt: now,
      })
    },
    [dispatch, enqueue],
  )
}

export function useDeleteCollection() {
  const { state, dispatch } = useStateContext()
  const enqueue = useEnqueue()
  return useCallback(
    (id: string) => {
      const existing = state.collections.find((c) => c.id === id)
      const now = Date.now()
      dispatch({ type: 'DELETE_COLLECTION', id, deletedAt: now })
      // The server needs the full row metadata for the tombstone — we can
      // only build it if we know what we're deleting. If the collection has
      // already been removed locally (double-click), skip the enqueue —
      // there is no row to tombstone.
      if (existing) {
        enqueue({
          kind: 'collection',
          id: existing.id,
          name: existing.name,
          deckIds: existing.deckIds,
          createdAt: existing.createdAt,
          updatedAt: now,
          deletedAt: now,
          enqueuedAt: now,
        })
      }
    },
    [state.collections, dispatch, enqueue],
  )
}

export function useResetProgress() {
  const { dispatch } = useStateContext()
  const clearQueue = useClearQueue()
  return useCallback(() => {
    dispatch({ type: 'RESET_PROGRESS' })
    // Wipe the pending mutation queue and reset last-sync-at to 0 so the
    // next sync re-pulls the user's data from a clean slate (or pushes the
    // emptied state, depending on which side has the newer rows under LWW).
    clearQueue()
  }, [dispatch, clearQueue])
}
