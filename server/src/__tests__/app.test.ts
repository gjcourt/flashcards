import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db.js'
import { createApp } from '../app.js'
import { makeTestDb } from './testdb.js'
import type { Env } from '../env.js'

const env: Env = {
  DATABASE_URL: 'postgres://x',
  AUTH_MODE: 'single-user',
  SINGLE_USER_ID: 'george',
  PORT: 8080,
  LOG_LEVEL: 'info',
  NODE_ENV: 'test',
}

describe('app', () => {
  let db: Kysely<Database>
  let destroy: () => Promise<void>

  beforeEach(async () => {
    const t = await makeTestDb()
    db = t.db
    destroy = t.destroy
  })

  afterEach(async () => {
    await destroy()
  })

  it('GET /healthz returns ok when DB reachable', async () => {
    const app = createApp({ env, db })
    const res = await app.request('/healthz')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  it('POST /api/sync with invalid JSON returns 400', async () => {
    const app = createApp({ env, db })
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('invalid json')
  })

  it('POST /api/sync with invalid shape returns 400 + zod details', async () => {
    const app = createApp({ env, db })
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ since: -5 }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; details: unknown[] }
    expect(body.error).toBe('invalid request')
    expect(Array.isArray(body.details)).toBe(true)
    expect(body.details.length).toBeGreaterThan(0)
  })

  it('POST /api/sync happy path returns 200 with response shape', async () => {
    const app = createApp({ env, db })
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        since: 0,
        mutations: {
          cardStates: [{ id: 'c1', fsrs: { last_review: '2026-01-01T00:00:00Z' } }],
          collections: [],
          reviews: [],
        },
      }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      now: number
      cardStates: unknown[]
      collections: unknown[]
      reviews: unknown[]
    }
    expect(typeof body.now).toBe('number')
    expect(Array.isArray(body.cardStates)).toBe(true)
    expect(Array.isArray(body.collections)).toBe(true)
    expect(Array.isArray(body.reviews)).toBe(true)
    expect(body.cardStates).toHaveLength(1)
  })

  it('POST /api/sync without body returns 400', async () => {
    const app = createApp({ env, db })
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })
    expect(res.status).toBe(400)
  })

  it('jwt mode requires the header', async () => {
    const jwtEnv: Env = { ...env, AUTH_MODE: 'jwt' }
    const app = createApp({ env: jwtEnv, db })
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ since: 0 }),
    })
    expect(res.status).toBe(401)
  })

  it('jwt mode passes through with valid header', async () => {
    const jwtEnv: Env = { ...env, AUTH_MODE: 'jwt' }
    const app = createApp({ env: jwtEnv, db })
    const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')
    const body = Buffer.from(JSON.stringify({ email: 'u@x.com' })).toString('base64url')
    const jwt = `${header}.${body}.sig`
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'CF-Access-Jwt-Assertion': jwt,
      },
      body: JSON.stringify({ since: 0 }),
    })
    expect(res.status).toBe(200)
  })
})
