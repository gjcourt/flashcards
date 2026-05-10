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
  hydrated: boolean
}

type Action =
  | { type: 'HYDRATE'; cardStates: CardStateMap }
  | { type: 'RATE_CARD'; cardId: string; fsrs: CardFSRSFields }

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'HYDRATE':
      return { cardStates: a.cardStates, hydrated: true }
    case 'RATE_CARD':
      return {
        ...s,
        cardStates: { ...s.cardStates, [a.cardId]: a.fsrs },
      }
  }
}

const StateContext = createContext<{
  state: State
  dispatch: Dispatch<Action>
} | null>(null)

export function StateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { cardStates: {}, hydrated: false })

  // Hydrate once on mount.
  useEffect(() => {
    dispatch({ type: 'HYDRATE', cardStates: loadCardStates() })
  }, [])

  // Persist on every change after hydration.
  const skipNextWrite = useRef(true)
  useEffect(() => {
    if (!state.hydrated) return
    if (skipNextWrite.current) {
      skipNextWrite.current = false
      return
    }
    saveCardStates(state.cardStates)
  }, [state.cardStates, state.hydrated])

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

export function useHydrated(): boolean {
  return useStateContext().state.hydrated
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
