import { useParams } from 'react-router-dom'
import { useCollections } from '../state'
import { MultiDeckReview } from './MultiDeckReview'

export function CollectionReview() {
  const { id } = useParams<{ id: string }>()
  if (!id) throw new Error('CollectionReview rendered without :id route param')

  const collections = useCollections()
  const collection = collections.find((c) => c.id === id)
  if (!collection) {
    throw new Response(`Collection not found: ${id}`, { status: 404 })
  }

  return <MultiDeckReview deckIds={collection.deckIds} title={collection.name} />
}
