import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useManifest } from '../decks/hooks'
import { useAddCollection, useCollections, useDeleteCollection, useResetProgress } from '../state'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function Manage() {
  const manifest = useManifest()
  const collections = useCollections()
  const addCollection = useAddCollection()
  const deleteCollection = useDeleteCollection()
  const resetProgress = useResetProgress()

  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const nextId = useMemo(() => slugify(name), [name])
  const idTaken = nextId.length > 0 && collections.some((c) => c.id === nextId)
  // nextId.length > 0 catches symbol-only names like "!!!" that trim non-empty
  // but slugify down to "" — those would otherwise create a collection with id "".
  const canSubmit = nextId.length > 0 && selected.size > 0 && !idTaken

  function toggleDeck(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!canSubmit) {
      setError('Pick a name and at least one deck.')
      return
    }
    addCollection({
      id: nextId,
      name: name.trim(),
      deckIds: [...selected],
      createdAt: Date.now(),
    })
    setName('')
    setSelected(new Set())
  }

  function handleReset() {
    if (
      !confirm(
        'Reset all card progress? Stored FSRS state for every card will be cleared. This cannot be undone.',
      )
    )
      return
    resetProgress()
  }

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Manage</h2>
        <Link
          to="/"
          className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          ← Home
        </Link>
      </div>

      {/* New collection */}
      <section>
        <h3 className="mb-2 text-lg font-semibold">New collection</h3>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          Combine multiple decks into a named study set. Reviewing it merges due cards across every
          selected deck.
        </p>
        <form onSubmit={handleCreate} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Interview prep"
              aria-invalid={idTaken || undefined}
              aria-describedby={idTaken ? 'collection-id-error' : undefined}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900"
            />
            {idTaken && (
              <p id="collection-id-error" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                A collection with id "{nextId}" already exists.
              </p>
            )}
          </label>

          <div>
            <span className="text-sm font-medium">Decks</span>
            {manifest.status === 'loading' && (
              <p className="mt-2 text-sm text-slate-500">Loading decks…</p>
            )}
            {manifest.status === 'error' && (
              <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                Failed to load decks: {manifest.error.message}
              </p>
            )}
            {manifest.status === 'ready' && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {manifest.data.decks.map((deck) => {
                  const checked = selected.has(deck.id)
                  return (
                    <label
                      key={deck.id}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                        checked
                          ? 'border-sky-500 bg-sky-50 dark:border-sky-700 dark:bg-sky-950'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDeck(deck.id)}
                        className="mt-1"
                      />
                      <span>
                        <span className="font-medium">{deck.name}</span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {deck.description}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {error && (
            <p role="alert" aria-live="polite" className="text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Create collection
          </button>
        </form>
      </section>

      {/* Existing collections */}
      <section>
        <h3 className="mb-2 text-lg font-semibold">Your collections</h3>
        {collections.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No collections yet. Create one above.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {collections.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div>
                  <Link to={`/collections/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  <span className="ml-2 text-xs text-slate-500">{c.deckIds.join(' · ')}</span>
                </div>
                <button
                  type="button"
                  onClick={() => deleteCollection(c.id)}
                  className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Danger zone */}
      <section>
        <h3 className="mb-2 text-lg font-semibold text-rose-700 dark:text-rose-400">Danger zone</h3>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
          Wipes the FSRS scheduling state for every card. Card content stays; review history and
          intervals are reset to "new".
        </p>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-lg border border-rose-600 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-500 dark:text-rose-400 dark:hover:bg-rose-950"
        >
          Reset all progress
        </button>
      </section>
    </div>
  )
}
