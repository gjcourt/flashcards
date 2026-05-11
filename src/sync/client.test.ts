import { describe, it, expect, vi } from 'vitest'
import { OfflineError, ServerError, syncOnce } from './client'
import type { SyncResponse } from './types'

const validResponse: SyncResponse = {
  now: 1_700_000_000_000,
  cardStates: [],
  collections: [],
  reviews: [],
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('syncOnce', () => {
  it('POSTs to /api/sync with JSON body and returns the parsed response on 2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(validResponse))
    const result = await syncOnce(
      { since: 0, mutations: { cardStates: [], collections: [], reviews: [] } },
      fetchMock,
    )
    expect(result).toEqual(validResponse)
    expect(fetchMock).toHaveBeenCalledOnce()
    const call = fetchMock.mock.calls[0]!
    const url = call[0] as string
    const init = call[1] as RequestInit | undefined
    expect(url).toBe('/api/sync')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init?.body as string)).toEqual({
      since: 0,
      mutations: { cardStates: [], collections: [], reviews: [] },
    })
  })

  it('throws OfflineError when fetch itself rejects (TypeError: Failed to fetch)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(
      syncOnce(
        { since: 0, mutations: { cardStates: [], collections: [], reviews: [] } },
        fetchMock,
      ),
    ).rejects.toBeInstanceOf(OfflineError)
  })

  it('throws ServerError with status on 4xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad request', { status: 400 }))
    const err = await syncOnce(
      { since: 0, mutations: { cardStates: [], collections: [], reviews: [] } },
      fetchMock,
    ).catch((e) => e)
    expect(err).toBeInstanceOf(ServerError)
    expect((err as ServerError).status).toBe(400)
  })

  it('throws ServerError with status on 5xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('boom', { status: 503 }))
    const err = await syncOnce(
      { since: 0, mutations: { cardStates: [], collections: [], reviews: [] } },
      fetchMock,
    ).catch((e) => e)
    expect(err).toBeInstanceOf(ServerError)
    expect((err as ServerError).status).toBe(503)
  })

  it('throws on a 2xx response with a malformed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ totally: 'wrong shape' }))
    await expect(
      syncOnce(
        { since: 0, mutations: { cardStates: [], collections: [], reviews: [] } },
        fetchMock,
      ),
    ).rejects.toThrow(/schema/i)
  })

  it('throws on a 2xx response with invalid JSON', async () => {
    const res = new Response('not json{{{', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    const fetchMock = vi.fn().mockResolvedValue(res)
    await expect(
      syncOnce(
        { since: 0, mutations: { cardStates: [], collections: [], reviews: [] } },
        fetchMock,
      ),
    ).rejects.toThrow(/JSON/)
  })
})
