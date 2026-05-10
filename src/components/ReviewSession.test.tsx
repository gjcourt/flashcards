import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { materialise } from '../decks/load'
import { StateProvider } from '../state'
import { ReviewSession } from './ReviewSession'

const deckJSON = {
  id: 'd',
  name: 'D',
  description: '',
  cards: [
    { id: 'one', term: 'One', definition: 'First card', category: 'x' },
    { id: 'two', term: 'Two', definition: 'Second card', category: 'x' },
  ],
}

beforeEach(() => {
  localStorage.clear()
})

function renderSession() {
  const deck = materialise(deckJSON)
  return render(
    <StateProvider>
      <ReviewSession cards={deck.cards} />
    </StateProvider>,
  )
}

describe('ReviewSession', () => {
  it('shows the first card front and a Show answer button', () => {
    renderSession()
    expect(screen.getByText('One')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show answer/i })).toBeInTheDocument()
  })

  it('reveals the back when Show answer is clicked', () => {
    renderSession()
    fireEvent.click(screen.getByRole('button', { name: /show answer/i }))
    expect(screen.getByText('First card')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /good/i })).toBeInTheDocument()
  })

  it('advances to the next card after rating', () => {
    renderSession()
    fireEvent.click(screen.getByRole('button', { name: /show answer/i }))
    fireEvent.click(screen.getByRole('button', { name: /good/i }))
    // After rating, the front of the next card (Two) appears.
    expect(screen.getByText('Two')).toBeInTheDocument()
    // And the answer is hidden again — Show answer is back.
    expect(screen.getByRole('button', { name: /show answer/i })).toBeInTheDocument()
  })

  it('shows an empty state when no cards are due', () => {
    render(
      <StateProvider>
        <ReviewSession cards={[]} emptyHint="Try the NATO deck instead." />
      </StateProvider>,
    )
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
    expect(screen.getByText(/try the nato deck/i)).toBeInTheDocument()
  })

  it('flips with the spacebar (Show answer button replaced by rating buttons)', () => {
    renderSession()
    expect(screen.getByRole('button', { name: /show answer/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /good/i })).not.toBeInTheDocument()
    fireEvent.keyDown(window, { code: 'Space' })
    expect(screen.queryByRole('button', { name: /show answer/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /good/i })).toBeInTheDocument()
  })

  it('rates after flipping via Space then digit key', () => {
    renderSession()
    fireEvent.keyDown(window, { code: 'Space' })
    expect(screen.getByRole('button', { name: /good/i })).toBeInTheDocument()
    // Press "3" (Good) → should advance to the next card.
    fireEvent.keyDown(window, { key: '3' })
    expect(screen.getByText('Two')).toBeInTheDocument()
  })

  it('does not double-toggle when Space fires with a button focused', () => {
    renderSession()
    const showAnswer = screen.getByRole('button', { name: /show answer/i })
    showAnswer.focus()
    // Dispatch keydown with the button as target — our handler should bail
    // out (the browser would synthesize a click separately, which is the
    // intended flip path).
    fireEvent.keyDown(showAnswer, { code: 'Space' })
    // Show answer is still present; no flip happened from the keydown handler.
    expect(screen.getByRole('button', { name: /show answer/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /good/i })).not.toBeInTheDocument()
  })
})
