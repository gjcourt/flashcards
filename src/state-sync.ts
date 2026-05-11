import { useCallback, useEffect, useRef, useState } from 'react'
import { loadLastSyncAt, loadQueueRaw, saveLastSyncAt, saveQueueRaw } from './storage'
import { OfflineError, ServerError, syncOnce } from './sync/client'
import {
  enqueue as enqueueQueue,
  removeSnapshot,
  snapshotToMutations,
  validateQueue,
} from './sync/queue'
import type { QueuedMutation, SyncResponse } from './sync/types'

export type SyncState = 'offline' | 'synced' | 'syncing' | 'error'

export type SyncStatus = {
  state: SyncState
  lastSyncAt: number | null
  errorMessage: string | null
}

export type UseSyncReturn = {
  enqueue: (mutation: QueuedMutation) => void
  clearQueue: () => void
  syncNow: () => void
  status: SyncStatus
}

type SyncOptions = {
  // Inject the apply-response callback so this hook stays decoupled from the
  // state reducer. The hook calls this synchronously with the SyncResponse
  // on a successful POST, before clearing the corresponding queue entries.
  onResponse: (response: SyncResponse) => void
  // Periodic interval in ms. Default 60s. Tests pass a smaller value or
  // rely on vi.useFakeTimers() to advance.
  intervalMs?: number
  // Inject for tests. Defaults to global fetch.
  fetchImpl?: typeof fetch
  // Whether to kick off an immediate sync on mount. Default true. Tests
  // disable this so they can drive sync timing manually.
  syncOnMount?: boolean
}

const DEFAULT_INTERVAL_MS = 60_000
// Throttle console.warn spam when the server is unreachable: we already keep
// the queue locally; one log per minute is enough to surface the problem.
const ERROR_LOG_THROTTLE_MS = 60_000

// ── useSync hook ─────────────────────────────────────────────────────────
export function useSync(opts: SyncOptions): UseSyncReturn {
  const { onResponse, intervalMs = DEFAULT_INTERVAL_MS, fetchImpl, syncOnMount = true } = opts

  // The queue and last-sync-at are owned by this hook. The queue lives in a
  // ref so we can enqueue/clear from inside the sync loop without triggering
  // re-renders; a parallel state mirror exists only to drive status updates.
  const queueRef = useRef<QueuedMutation[]>(validateQueue(loadQueueRaw()))
  const lastSyncAtRef = useRef<number>(loadLastSyncAt())
  const inFlightRef = useRef<boolean>(false)
  const lastErrorLogAtRef = useRef<number>(0)

  // The latest onResponse callback so the sync loop always uses the current
  // reducer dispatch (the consumer might recreate it on each render).
  const onResponseRef = useRef(onResponse)
  useEffect(() => {
    onResponseRef.current = onResponse
  }, [onResponse])

  const [status, setStatus] = useState<SyncStatus>(() => ({
    state: lastSyncAtRef.current > 0 ? 'synced' : 'offline',
    lastSyncAt: lastSyncAtRef.current > 0 ? lastSyncAtRef.current : null,
    errorMessage: null,
  }))

  const persistQueue = useCallback(() => {
    saveQueueRaw(queueRef.current)
  }, [])

  const enqueue = useCallback(
    (mutation: QueuedMutation) => {
      queueRef.current = enqueueQueue(queueRef.current, mutation)
      persistQueue()
    },
    [persistQueue],
  )

  const clearQueue = useCallback(() => {
    queueRef.current = []
    lastSyncAtRef.current = 0
    saveQueueRaw([])
    saveLastSyncAt(0)
    setStatus({ state: 'offline', lastSyncAt: null, errorMessage: null })
  }, [])

  const runSync = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    const snapshot = [...queueRef.current]
    const since = lastSyncAtRef.current
    setStatus((s) => ({ ...s, state: 'syncing' }))
    try {
      const response = await syncOnce(
        { since, mutations: snapshotToMutations(snapshot) },
        fetchImpl,
      )
      // Apply the server's view to local state BEFORE clearing the queue so
      // a crash between the two leaves the queue intact (we'll re-push).
      onResponseRef.current(response)
      queueRef.current = removeSnapshot(queueRef.current, snapshot)
      persistQueue()
      lastSyncAtRef.current = response.now
      saveLastSyncAt(response.now)
      setStatus({ state: 'synced', lastSyncAt: response.now, errorMessage: null })
    } catch (err) {
      const now = Date.now()
      const shouldLog = now - lastErrorLogAtRef.current > ERROR_LOG_THROTTLE_MS
      if (shouldLog) {
        lastErrorLogAtRef.current = now
        console.warn('flashcards: sync failed:', err)
      }
      if (err instanceof OfflineError) {
        setStatus((s) => ({
          state: 'offline',
          lastSyncAt: s.lastSyncAt,
          errorMessage: err.message,
        }))
      } else if (err instanceof ServerError) {
        setStatus((s) => ({
          state: 'error',
          lastSyncAt: s.lastSyncAt,
          errorMessage: `HTTP ${err.status}`,
        }))
      } else {
        const msg = err instanceof Error ? err.message : String(err)
        setStatus((s) => ({ state: 'error', lastSyncAt: s.lastSyncAt, errorMessage: msg }))
      }
    } finally {
      inFlightRef.current = false
    }
  }, [fetchImpl, persistQueue])

  const syncNow = useCallback(() => {
    // Fire-and-forget. Callers don't await; errors are surfaced via status.
    void runSync()
  }, [runSync])

  // ── Lifecycle: mount → interval → visibilitychange ─────────────────────
  useEffect(() => {
    if (syncOnMount) {
      void runSync()
    }
    const interval = window.setInterval(() => {
      void runSync()
    }, intervalMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void runSync()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [runSync, intervalMs, syncOnMount])

  return { enqueue, clearQueue, syncNow, status }
}
