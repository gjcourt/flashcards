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
import type { AppCard, Collection, ReviewLogEntry } from './types'

type State = {
  cardStates: CardStateMap
  collections: Collection[]
  reviews: ReviewLogEntry[]
}

type Action =
  | { type: 'RATE_CARD'; cardId: string; fsrs: CardFSRSFields; entry: ReviewLogEntry }
  | { type: 'ADD_COLLECTION'; collection: Collection }
  | { type: 'DELETE_COLLECTION'; id: string }
  | { type: 'RESET_PROGRESS' }

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

export function StateProvider({ children }: { children: ReactNode }) {
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
  return <StateContext.Provider value={value}>{children}</StateContext.Provider>
}

function useStateContext() {
  const ctx = useContext(StateContext)
  if (!ctx) throw new Error('useStateContext must be used inside <StateProvider>')
  return ctx
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
  return useCallback(
    (card: AppCard, grade: Grade, now?: Date): AppCard => {
      const { card: next, log } = rate(card, grade, now)
      dispatch({
        type: 'RATE_CARD',
        cardId: card.id,
        fsrs: fsrsOf(next),
        entry: { cardId: card.id, ratedAt: log.review.getTime(), rating: log.rating },
      })
      return next
    },
    [dispatch],
  )
}

/**
 * Add a collection. **Overwrites** any existing collection with the same id.
 * Callers are expected to enforce id uniqueness in UI (see Manage's idTaken check).
 */
export function useAddCollection() {
  const { dispatch } = useStateContext()
  return useCallback(
    (collection: Collection) => dispatch({ type: 'ADD_COLLECTION', collection }),
    [dispatch],
  )
}

export function useDeleteCollection() {
  const { dispatch } = useStateContext()
  return useCallback((id: string) => dispatch({ type: 'DELETE_COLLECTION', id }), [dispatch])
}

export function useResetProgress() {
  const { dispatch } = useStateContext()
  return useCallback(() => dispatch({ type: 'RESET_PROGRESS' }), [dispatch])
}
