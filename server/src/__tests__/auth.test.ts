import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type JWTVerifyGetKey,
} from 'jose'
import {
  __resetJwksCacheForTests,
  authMiddleware,
  cfAccessCertsUrl,
  cfAccessIssuer,
  verifyCfAccessJwt,
  type AuthVariables,
  type CfAccessConfig,
} from '../auth.js'
import type { Env } from '../env.js'

const TEAM_DOMAIN = 'https://acme.cloudflareaccess.com'
const AUD = 'app-aud-tag-abc123'
const ISSUER = 'https://acme.cloudflareaccess.com'

const baseEnv: Env = {
  DATABASE_URL: 'postgres://x',
  AUTH_MODE: 'single-user',
  SINGLE_USER_ID: 'local',
  PORT: 8080,
  LOG_LEVEL: 'info',
  NODE_ENV: 'test',
}

const jwtEnv: Env = {
  ...baseEnv,
  AUTH_MODE: 'jwt',
  CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
  CF_ACCESS_AUD: AUD,
}

const KID = 'test-key-1'

interface KeyMaterial {
  privateKey: CryptoKey
  publicJwk: JWK
  jwks: { keys: JWK[] }
  keySet: JWTVerifyGetKey
}

async function makeKeyMaterial(): Promise<KeyMaterial> {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const publicJwk: JWK = { ...(await exportJWK(publicKey)), kid: KID, alg: 'RS256', use: 'sig' }
  const jwks = { keys: [publicJwk] }
  return { privateKey, publicJwk, jwks, keySet: createLocalJWKSet(jwks) }
}

interface SignOpts {
  key: CryptoKey
  claims?: Record<string, unknown>
  issuer?: string
  audience?: string
  expiresIn?: string
  notBefore?: string | number
}

async function signToken(opts: SignOpts): Promise<string> {
  const jwt = new SignJWT({ email: 'george@example.com', ...opts.claims })
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuedAt()
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? AUD)
  if (opts.notBefore !== undefined) jwt.setNotBefore(opts.notBefore)
  jwt.setExpirationTime(opts.expiresIn ?? '5m')
  return jwt.sign(opts.key)
}

const config: CfAccessConfig = { teamDomain: TEAM_DOMAIN, aud: AUD }

describe('cfAccessIssuer / cfAccessCertsUrl', () => {
  it('normalizes a bare team domain to an https origin', () => {
    expect(cfAccessIssuer('acme.cloudflareaccess.com')).toBe('https://acme.cloudflareaccess.com')
    expect(cfAccessIssuer('https://acme.cloudflareaccess.com/')).toBe(
      'https://acme.cloudflareaccess.com',
    )
  })

  it('builds the JWKS certs URL', () => {
    expect(cfAccessCertsUrl('acme.cloudflareaccess.com').toString()).toBe(
      'https://acme.cloudflareaccess.com/cdn-cgi/access/certs',
    )
  })
})

describe('verifyCfAccessJwt', () => {
  it('accepts a validly-signed token with correct aud + iss', async () => {
    const km = await makeKeyMaterial()
    const token = await signToken({ key: km.privateKey })
    await expect(verifyCfAccessJwt(token, config, km.keySet)).resolves.toBe('george@example.com')
  })

  it('rejects a token signed by the wrong key (forged signature)', async () => {
    const km = await makeKeyMaterial()
    const attacker = await makeKeyMaterial() // different keypair, same kid
    const token = await signToken({ key: attacker.privateKey })
    await expect(verifyCfAccessJwt(token, config, km.keySet)).rejects.toThrow()
  })

  it('rejects an unsigned / alg=none style token', async () => {
    const km = await makeKeyMaterial()
    // Hand-craft an unsigned token (alg:none, empty signature).
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(
      JSON.stringify({ email: 'george@example.com', iss: ISSUER, aud: AUD }),
    ).toString('base64url')
    const unsigned = `${header}.${body}.`
    await expect(verifyCfAccessJwt(unsigned, config, km.keySet)).rejects.toThrow()
  })

  it('rejects a token with the wrong audience', async () => {
    const km = await makeKeyMaterial()
    const token = await signToken({ key: km.privateKey, audience: 'some-other-app' })
    await expect(verifyCfAccessJwt(token, config, km.keySet)).rejects.toThrow()
  })

  it('rejects a token with the wrong issuer', async () => {
    const km = await makeKeyMaterial()
    const token = await signToken({ key: km.privateKey, issuer: 'https://evil.example.com' })
    await expect(verifyCfAccessJwt(token, config, km.keySet)).rejects.toThrow()
  })

  it('rejects an expired token', async () => {
    const km = await makeKeyMaterial()
    const token = await signToken({ key: km.privateKey, expiresIn: '-1m' })
    await expect(verifyCfAccessJwt(token, config, km.keySet)).rejects.toThrow()
  })

  it('rejects a not-yet-valid (nbf in the future) token', async () => {
    const km = await makeKeyMaterial()
    const future = Math.floor(Date.now() / 1000) + 3600
    const token = await signToken({ key: km.privateKey, notBefore: future })
    await expect(verifyCfAccessJwt(token, config, km.keySet)).rejects.toThrow()
  })

  it('returns null for a valid token without an email claim', async () => {
    const km = await makeKeyMaterial()
    const token = await signToken({ key: km.privateKey, claims: { email: undefined, sub: 'u1' } })
    await expect(verifyCfAccessJwt(token, config, km.keySet)).resolves.toBeNull()
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
  beforeEach(() => {
    __resetJwksCacheForTests()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Stub global fetch so `createRemoteJWKSet` resolves against our local JWKS
  // instead of hitting the network.
  function stubJwksFetch(jwks: { keys: JWK[] }): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input)
        if (url === cfAccessCertsUrl(TEAM_DOMAIN).toString()) {
          return new Response(JSON.stringify(jwks), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )
  }

  function buildApp(env: Env) {
    const app = new Hono<{ Variables: AuthVariables }>()
    app.use('/p/*', authMiddleware(env))
    app.get('/p/me', (c) => c.json(c.get('auth')))
    return app
  }

  it('fails closed (401) when CF_ACCESS_* config is unset', async () => {
    const km = await makeKeyMaterial()
    stubJwksFetch(km.jwks)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const app = buildApp({ ...baseEnv, AUTH_MODE: 'jwt' }) // no CF_ACCESS_* vars
    const token = await signToken({ key: km.privateKey })
    const res = await app.request('/p/me', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    })
    expect(res.status).toBe(401)
    errSpy.mockRestore()
  })

  it('rejects requests with no token', async () => {
    const km = await makeKeyMaterial()
    stubJwksFetch(km.jwks)
    const res = await buildApp(jwtEnv).request('/p/me')
    expect(res.status).toBe(401)
  })

  it('accepts a validly-signed token and attaches its email', async () => {
    const km = await makeKeyMaterial()
    stubJwksFetch(km.jwks)
    const token = await signToken({ key: km.privateKey })
    const res = await buildApp(jwtEnv).request('/p/me', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { userId: string }
    expect(body.userId).toBe('george@example.com')
  })

  it('accepts the token from the CF_Authorization cookie', async () => {
    const km = await makeKeyMaterial()
    stubJwksFetch(km.jwks)
    const token = await signToken({ key: km.privateKey })
    const res = await buildApp(jwtEnv).request('/p/me', {
      headers: { cookie: `CF_Authorization=${token}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { userId: string }
    expect(body.userId).toBe('george@example.com')
  })

  it('rejects a forged token signed by an unknown key', async () => {
    const km = await makeKeyMaterial()
    stubJwksFetch(km.jwks)
    const attacker = await makeKeyMaterial()
    const token = await signToken({ key: attacker.privateKey })
    const res = await buildApp(jwtEnv).request('/p/me', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    })
    expect(res.status).toBe(401)
  })

  it('rejects a garbage / non-JWT token', async () => {
    const km = await makeKeyMaterial()
    stubJwksFetch(km.jwks)
    const res = await buildApp(jwtEnv).request('/p/me', {
      headers: { 'Cf-Access-Jwt-Assertion': 'not-a-jwt' },
    })
    expect(res.status).toBe(401)
  })

  it('rejects a token with the wrong aud', async () => {
    const km = await makeKeyMaterial()
    stubJwksFetch(km.jwks)
    const token = await signToken({ key: km.privateKey, audience: 'wrong-app' })
    const res = await buildApp(jwtEnv).request('/p/me', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    })
    expect(res.status).toBe(401)
  })

  it('rejects an expired token', async () => {
    const km = await makeKeyMaterial()
    stubJwksFetch(km.jwks)
    const token = await signToken({ key: km.privateKey, expiresIn: '-1m' })
    const res = await buildApp(jwtEnv).request('/p/me', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    })
    expect(res.status).toBe(401)
  })
})
