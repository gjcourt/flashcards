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
  saveCardStates,
  saveCollections,
  type CardFSRSFields,
  type CardStateMap,
} from './storage'
import type { AppCard, Collection } from './types'

type State = {
  cardStates: CardStateMap
  collections: Collection[]
}

type Action =
  | { type: 'RATE_CARD'; cardId: string; fsrs: CardFSRSFields }
  | { type: 'ADD_COLLECTION'; collection: Collection }
  | { type: 'DELETE_COLLECTION'; id: string }
  | { type: 'RESET_PROGRESS' }

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'RATE_CARD':
      return { ...s, cardStates: { ...s.cardStates, [a.cardId]: a.fsrs } }
    case 'ADD_COLLECTION':
      // Replace if the same id already exists; otherwise append.
      return {
        ...s,
        collections: [...s.collections.filter((c) => c.id !== a.collection.id), a.collection],
      }
    case 'DELETE_COLLECTION':
      return { ...s, collections: s.collections.filter((c) => c.id !== a.id) }
    case 'RESET_PROGRESS':
      return { ...s, cardStates: {} }
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
  return { cardStates: loadCardStates(), collections: loadCollections() }
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

export function useRateCard() {
  const { dispatch } = useStateContext()
  return useCallback(
    (card: AppCard, grade: Grade, now?: Date): AppCard => {
      const { card: next } = rate(card, grade, now)
      dispatch({ type: 'RATE_CARD', cardId: card.id, fsrs: fsrsOf(next) })
      return next
    },
    [dispatch],
  )
}

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
