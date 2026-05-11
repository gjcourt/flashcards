import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { authMiddleware, extractEmailUnverified, type AuthVariables } from '../auth.js'
import type { Env } from '../env.js'

const baseEnv: Env = {
  DATABASE_URL: 'postgres://x',
  AUTH_MODE: 'single-user',
  SINGLE_USER_ID: 'local',
  PORT: 8080,
  LOG_LEVEL: 'info',
  NODE_ENV: 'test',
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.signature`
}

describe('extractEmailUnverified', () => {
  it('extracts email from a valid JWT payload', () => {
    const jwt = makeJwt({ email: 'george@example.com', sub: 'u1' })
    expect(extractEmailUnverified(jwt)).toBe('george@example.com')
  })

  it('returns null when email claim missing', () => {
    const jwt = makeJwt({ sub: 'u1' })
    expect(extractEmailUnverified(jwt)).toBeNull()
  })

  it('returns null on malformed JWT (not 3 parts)', () => {
    expect(extractEmailUnverified('foo.bar')).toBeNull()
    expect(extractEmailUnverified('only-one-part')).toBeNull()
  })

  it('returns null when payload is not valid base64url JSON', () => {
    expect(extractEmailUnverified('aaa.notbase64!!.ccc')).toBeNull()
  })

  it('returns null when email is not a string', () => {
    const jwt = makeJwt({ email: 12345 })
    expect(extractEmailUnverified(jwt)).toBeNull()
  })
})

describe('authMiddleware (single-user mode)', () => {
  it('attaches the configured SINGLE_USER_ID', async () => {
    const app = new Hono<{ Variables: AuthVariables }>()
    app.use('/p/*', authMiddleware({ ...baseEnv, SINGLE_USER_ID: 'george' }))
    app.get('/p/me', (c) => c.json(c.get('auth')))

    const res = await app.request('/p/me')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { userId: string }
    expect(body.userId).toBe('george')
  })

  it('ignores any JWT header when in single-user mode', async () => {
    const app = new Hono<{ Variables: AuthVariables }>()
    app.use('/p/*', authMiddleware(baseEnv))
    app.get('/p/me', (c) => c.json(c.get('auth')))

    const res = await app.request('/p/me', {
      headers: { 'CF-Access-Jwt-Assertion': 'whatever' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { userId: string }
    expect(body.userId).toBe('local')
  })
})

describe('authMiddleware (jwt mode)', () => {
  const env: Env = { ...baseEnv, AUTH_MODE: 'jwt' }

  it('rejects requests with no JWT header', async () => {
    const app = new Hono<{ Variables: AuthVariables }>()
    app.use('/p/*', authMiddleware(env))
    app.get('/p/me', (c) => c.json(c.get('auth')))

    const res = await app.request('/p/me')
    expect(res.status).toBe(401)
  })

  it('rejects requests with malformed JWT', async () => {
    const app = new Hono<{ Variables: AuthVariables }>()
    app.use('/p/*', authMiddleware(env))
    app.get('/p/me', (c) => c.json(c.get('auth')))

    const res = await app.request('/p/me', {
      headers: { 'CF-Access-Jwt-Assertion': 'not-a-jwt' },
    })
    expect(res.status).toBe(401)
  })

  it('attaches email from a valid (unverified) JWT', async () => {
    const app = new Hono<{ Variables: AuthVariables }>()
    app.use('/p/*', authMiddleware(env))
    app.get('/p/me', (c) => c.json(c.get('auth')))

    const jwt = makeJwt({ email: 'user@x.com' })
    const res = await app.request('/p/me', {
      headers: { 'CF-Access-Jwt-Assertion': jwt },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { userId: string }
    expect(body.userId).toBe('user@x.com')
  })
})
