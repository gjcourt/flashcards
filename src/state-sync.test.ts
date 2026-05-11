import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useSync } from './state-sync'
import type { SyncResponse } from './sync/types'

function jsonResponse(body: SyncResponse, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

const okResponse: SyncResponse = {
  now: 1_700_000_000_000,
  cardStates: [],
  collections: [],
  reviews: [],
}

describe('useSync — lifecycle', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs a periodic sync on intervalMs ticks (fake timers)', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(okResponse))
    const onResponse = vi.fn()
    renderHook(() =>
      useSync({
        onResponse,
        fetchImpl: fetchMock as unknown as typeof fetch,
        intervalMs: 5_000,
        syncOnMount: false, // we want to count interval ticks, not the mount sync
      }),
    )
    // No mount sync.
    expect(fetchMock).not.toHaveBeenCalled()
    // Advance past one interval. Use act+async timers so React state flushes.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_001)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_001)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('syncs on visibilitychange to visible', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(okResponse))
    const onResponse = vi.fn()
    renderHook(() =>
      useSync({
        onResponse,
        fetchImpl: fetchMock as unknown as typeof fetch,
        intervalMs: 10_000_000,
        syncOnMount: false,
      }),
    )
    // Force visibility "visible" and dispatch the event.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
  })

  it('does NOT sync on visibilitychange when hidden', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(okResponse))
    const onResponse = vi.fn()
    renderHook(() =>
      useSync({
        onResponse,
        fetchImpl: fetchMock as unknown as typeof fetch,
        intervalMs: 10_000_000,
        syncOnMount: false,
      }),
    )
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    // Give microtasks a chance to flush; fetch should still be untouched.
    await new Promise((r) => setTimeout(r, 20))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('useSync — error log throttle', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('logs only once per minute on repeated failures', async () => {
    // Suppress + spy on console.warn.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    let nowMs = 1_000_000
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => nowMs)

    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const onResponse = vi.fn()

    const { result } = renderHook(() =>
      useSync({
        onResponse,
        fetchImpl: fetchMock as unknown as typeof fetch,
        intervalMs: 10_000_000,
        syncOnMount: false,
      }),
    )

    // First failure: should log.
    await act(async () => {
      result.current.syncNow()
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(warnSpy).toHaveBeenCalledTimes(1)

    // Second failure 30s later (within throttle window): should NOT log again.
    nowMs += 30_000
    await act(async () => {
      result.current.syncNow()
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(warnSpy).toHaveBeenCalledTimes(1)

    // Third failure 61s after the first (past the throttle window): logs again.
    nowMs += 31_000
    await act(async () => {
      result.current.syncNow()
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(warnSpy).toHaveBeenCalledTimes(2)

    warnSpy.mockRestore()
    dateSpy.mockRestore()
  })
})

describe('useSync — boot sync with since=0', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('first sync sends since=0 when no lastSyncAt is persisted', async () => {
    const bodies: { since: number }[] = []
    const fetchMock = vi.fn().mockImplementation((_u: string, init?: RequestInit) => {
      bodies.push(JSON.parse(init?.body as string) as { since: number })
      return Promise.resolve(jsonResponse(okResponse))
    })
    const onResponse = vi.fn()
    renderHook(() =>
      useSync({
        onResponse,
        fetchImpl: fetchMock as unknown as typeof fetch,
        intervalMs: 10_000_000,
        syncOnMount: true,
      }),
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(bodies[0]?.since).toBe(0)
  })

  it('subsequent sync sends since=lastSyncAt persisted from previous response', async () => {
    localStorage.setItem('flashcards:last-sync-at', JSON.stringify(1_234_567))
    const bodies: { since: number }[] = []
    const fetchMock = vi.fn().mockImplementation((_u: string, init?: RequestInit) => {
      bodies.push(JSON.parse(init?.body as string) as { since: number })
      return Promise.resolve(jsonResponse(okResponse))
    })
    const onResponse = vi.fn()
    renderHook(() =>
      useSync({
        onResponse,
        fetchImpl: fetchMock as unknown as typeof fetch,
        intervalMs: 10_000_000,
        syncOnMount: true,
      }),
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(bodies[0]?.since).toBe(1_234_567)
  })
})
