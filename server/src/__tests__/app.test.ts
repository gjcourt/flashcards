import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Kysely } from 'kysely'
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose'
import type { Database } from '../db.js'
import { createApp } from '../app.js'
import { __resetJwksCacheForTests, cfAccessCertsUrl } from '../auth.js'
import { makeTestDb } from './testdb.js'
import type { Env } from '../env.js'

const CF_TEAM_DOMAIN = 'https://acme.cloudflareaccess.com'
const CF_AUD = 'app-aud-tag-abc123'
const CF_KID = 'app-test-key'

async function makeSignedAccessJwt(): Promise<{ token: string; jwks: { keys: JWK[] } }> {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const publicJwk: JWK = { ...(await exportJWK(publicKey)), kid: CF_KID, alg: 'RS256', use: 'sig' }
  const token = await new SignJWT({ email: 'u@x.com' })
    .setProtectedHeader({ alg: 'RS256', kid: CF_KID })
    .setIssuedAt()
    .setIssuer(CF_TEAM_DOMAIN)
    .setAudience(CF_AUD)
    .setExpirationTime('5m')
    .sign(privateKey)
  return { token, jwks: { keys: [publicJwk] } }
}

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

  it('jwt mode fails closed (401) when CF_ACCESS_* config is unset', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const jwtEnv: Env = { ...env, AUTH_MODE: 'jwt' }
    const app = createApp({ env: jwtEnv, db })
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ since: 0 }),
    })
    expect(res.status).toBe(401)
    errSpy.mockRestore()
  })

  it('jwt mode rejects a request with no token', async () => {
    const jwtEnv: Env = {
      ...env,
      AUTH_MODE: 'jwt',
      CF_ACCESS_TEAM_DOMAIN: CF_TEAM_DOMAIN,
      CF_ACCESS_AUD: CF_AUD,
    }
    const app = createApp({ env: jwtEnv, db })
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ since: 0 }),
    })
    expect(res.status).toBe(401)
  })

  it('jwt mode passes through with a validly-signed token', async () => {
    __resetJwksCacheForTests()
    const { token, jwks } = await makeSignedAccessJwt()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        if (String(input) === cfAccessCertsUrl(CF_TEAM_DOMAIN).toString()) {
          return new Response(JSON.stringify(jwks), { status: 200 })
        }
        throw new Error(`unexpected fetch: ${String(input)}`)
      }),
    )
    try {
      const jwtEnv: Env = {
        ...env,
        AUTH_MODE: 'jwt',
        CF_ACCESS_TEAM_DOMAIN: CF_TEAM_DOMAIN,
        CF_ACCESS_AUD: CF_AUD,
      }
      const app = createApp({ env: jwtEnv, db })
      const res = await app.request('/api/sync', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Access-Jwt-Assertion': token,
        },
        body: JSON.stringify({ since: 0 }),
      })
      expect(res.status).toBe(200)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('jwt mode rejects a forged token', async () => {
    __resetJwksCacheForTests()
    const { jwks } = await makeSignedAccessJwt()
    const attacker = await makeSignedAccessJwt() // token signed by a different key
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        if (String(input) === cfAccessCertsUrl(CF_TEAM_DOMAIN).toString()) {
          return new Response(JSON.stringify(jwks), { status: 200 })
        }
        throw new Error(`unexpected fetch: ${String(input)}`)
      }),
    )
    try {
      const jwtEnv: Env = {
        ...env,
        AUTH_MODE: 'jwt',
        CF_ACCESS_TEAM_DOMAIN: CF_TEAM_DOMAIN,
        CF_ACCESS_AUD: CF_AUD,
      }
      const app = createApp({ env: jwtEnv, db })
      const res = await app.request('/api/sync', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'CF-Access-Jwt-Assertion': attacker.token,
        },
        body: JSON.stringify({ since: 0 }),
      })
      expect(res.status).toBe(401)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
