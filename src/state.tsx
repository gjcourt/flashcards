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
  saveCardStates,
  type CardFSRSFields,
  type CardStateMap,
} from './storage'
import type { AppCard } from './types'

type State = {
  cardStates: CardStateMap
}

type Action = { type: 'RATE_CARD'; cardId: string; fsrs: CardFSRSFields }

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'RATE_CARD':
      return { cardStates: { ...s.cardStates, [a.cardId]: a.fsrs } }
  }
  // Reachable only if a new Action variant is added without a matching case.
  // TS doesn't narrow single-variant unions to `never` after switch, so a
  // runtime assertion is the cheapest backstop until we have ≥2 variants.
  throw new Error(`Unhandled action: ${JSON.stringify(a)}`)
}

// Synchronous initial-state computation — reads localStorage during the
// first reducer init so there is no asynchronous "empty then hydrated"
// window where a user rating could be clobbered by a late HYDRATE.
function init(): State {
  return { cardStates: loadCardStates() }
}

const StateContext = createContext<{
  state: State
  dispatch: Dispatch<Action>
} | null>(null)

export function StateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init)

  // Skip the very first persist — the state we just read in init() doesn't
  // need to be written back. Subsequent state changes flow to disk normally.
  const skipNextWrite = useRef(true)
  useEffect(() => {
    if (skipNextWrite.current) {
      skipNextWrite.current = false
      return
    }
    saveCardStates(state.cardStates)
  }, [state.cardStates])

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
