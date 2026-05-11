import type { SyncRequest, SyncResponse } from './types'

// ── Error taxonomy ───────────────────────────────────────────────────────
// Callers distinguish "we're offline / the server isn't reachable" (retry
// silently, downgrade UI to offline) from "the server returned an HTTP
// error" (likely a real bug, surface to the user).

export class OfflineError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'OfflineError'
  }
}

export class ServerError extends Error {
  readonly status: number
  constructor(status: number, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ServerError'
    this.status = status
  }
}

// ── Boundary validation ──────────────────────────────────────────────────
// fetch().json() is `any` — narrow at the boundary so the rest of the
// codebase can rely on the SyncResponse shape.

function isFsrsResponse(v: unknown): v is SyncResponse {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return (
    typeof r.now === 'number' &&
    Array.isArray(r.cardStates) &&
    Array.isArray(r.collections) &&
    Array.isArray(r.reviews)
  )
}

// `syncOnce` POSTs the request to /api/sync and returns the parsed response.
// Throws:
//   - OfflineError on network-level failure (TypeError thrown by fetch when
//     the host is unreachable, DNS fails, CORS blocks etc.)
//   - ServerError on any non-2xx status
//   - generic Error on a 2xx with a malformed body
export async function syncOnce(
  req: SyncRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<SyncResponse> {
  let res: Response
  try {
    res = await fetchImpl('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  } catch (err) {
    // Per WHATWG fetch, network errors surface as a TypeError. We treat any
    // thrown error from the call itself as "offline" — the server hasn't had
    // a chance to respond, so the queue stays intact for the next retry.
    const msg = err instanceof Error ? err.message : String(err)
    throw new OfflineError(`Sync request failed: ${msg}`, { cause: err })
  }

  if (!res.ok) {
    let text = ''
    try {
      text = await res.text()
    } catch {
      // ignore — best-effort error context
    }
    throw new ServerError(res.status, `Sync HTTP ${res.status}: ${text.slice(0, 200)}`)
  }

  let parsed: unknown
  try {
    parsed = await res.json()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Sync response was not valid JSON: ${msg}`, { cause: err })
  }

  if (!isFsrsResponse(parsed)) {
    throw new Error('Sync response did not match expected schema')
  }
  return parsed
}
