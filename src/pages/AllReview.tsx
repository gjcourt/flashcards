import { MultiDeckReview } from './MultiDeckReview'

export function AllReview() {
  return (
    <MultiDeckReview
      deckIds={null}
      title="Review all decks"
      description="Merged due queue across every bundled deck. Most overdue cards surface first."
    />
  )
}
