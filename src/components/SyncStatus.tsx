import { useEffect, useState } from 'react'
import type { SyncStatus as Status } from '../state-sync'

const RELATIVE_TIME = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

function describeRelative(at: number, now: number): string {
  const ms = at - now
  const absMs = Math.abs(ms)
  if (absMs >= 86_400_000) return RELATIVE_TIME.format(Math.round(ms / 86_400_000), 'day')
  if (absMs >= 3_600_000) return RELATIVE_TIME.format(Math.round(ms / 3_600_000), 'hour')
  if (absMs >= 60_000) return RELATIVE_TIME.format(Math.round(ms / 60_000), 'minute')
  return RELATIVE_TIME.format(Math.round(ms / 1000), 'second')
}

export type SyncStatusProps = {
  status: Status
  // Inject for tests; defaults to Date.now() at render.
  now?: number
}

// Small status pill rendered in the header. Pure & props-driven so it can be
// snapshot-tested without spinning up the whole sync layer.
export function SyncStatus({ status, now }: SyncStatusProps) {
  // For "synced X ago" we need a non-stale `now`. Date.now() can't be called
  // in render (react-hooks/purity), so we capture the initial value via
  // useState's lazy initialiser and tick it every 30s. Tests inject `now`
  // directly to skip this.
  const [tickNow, setTickNow] = useState<number>(() => Date.now())
  useEffect(() => {
    if (now !== undefined) return
    const id = window.setInterval(() => setTickNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [now])
  const effectiveNow = now ?? tickNow
  const { state, lastSyncAt, errorMessage } = status

  // Tailwind colour palette per state. Chosen for adequate contrast in both
  // light and dark mode; classes are static strings so Tailwind's JIT picks
  // them up at build time (don't template these — JIT can't see them).
  if (state === 'syncing') {
    return (
      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-400"
        data-sync-state="syncing"
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
        Syncing…
      </span>
    )
  }

  if (state === 'offline') {
    return (
      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"
        data-sync-state="offline"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
        Offline
      </span>
    )
  }

  if (state === 'error') {
    return (
      <span
        role="status"
        aria-live="polite"
        title={errorMessage ?? 'Sync error'}
        className="inline-flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-400"
        data-sync-state="error"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        Sync error
      </span>
    )
  }

  // 'synced'
  const relative = lastSyncAt !== null ? describeRelative(lastSyncAt, effectiveNow) : 'just now'
  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400"
      data-sync-state="synced"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Synced {relative}
    </span>
  )
}
