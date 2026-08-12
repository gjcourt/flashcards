import type { Context, MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import type { Env } from './env.js'

export interface AuthContext {
  userId: string
}

// Hono variable map for typed c.get('auth').
export type AuthVariables = {
  auth: AuthContext
}

/**
 * Auth middleware.
 *
 * Two modes:
 *
 *   - `single-user`: Every request is mapped to `SINGLE_USER_ID`.
 *     Intended for solo deployments behind a trusted gateway.
 *
 *   - `jwt`: Cloudflare Access mode. Reads the CF-Access assertion from the
 *     `Cf-Access-Jwt-Assertion` header (or the `CF_Authorization` cookie),
 *     **cryptographically verifies** it against the team's JWKS
 *     (`<team-domain>/cdn-cgi/access/certs`, RS256, selected by `kid`), and
 *     validates `iss` (= team domain), `aud` (= app AUD tag) and `exp`/`nbf`
 *     before trusting the `email` claim as the user id. Any failure → 401.
 *
 *     Requires `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`. If either is unset
 *     the middleware **fails closed**: every request is rejected with 401.
 *     See README.md > Auth modes.
 */
export function authMiddleware(env: Env): MiddlewareHandler<{ Variables: AuthVariables }> {
  if (env.AUTH_MODE === 'single-user') {
    return async (c, next) => {
      c.set('auth', { userId: env.SINGLE_USER_ID })
      await next()
    }
  }

  // jwt mode. Fail closed when the verifier cannot be configured: without the
  // team domain and AUD we cannot verify anything, so we must reject rather
  // than fall back to trusting an unverified token.
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN
  const aud = env.CF_ACCESS_AUD
  if (!teamDomain || !aud) {
    console.error(
      '[auth] AUTH_MODE=jwt but CF_ACCESS_TEAM_DOMAIN and/or CF_ACCESS_AUD are unset; ' +
        'refusing all requests (fail closed). Set both to enable Cloudflare Access verification.',
    )
    return async (c) => c.json({ error: 'auth misconfigured' }, 401)
  }

  const config: CfAccessConfig = { teamDomain, aud }
  const keySet = remoteJwks(teamDomain)

  return async (c, next) => {
    const token = c.req.header('Cf-Access-Jwt-Assertion') ?? getCookie(c, 'CF_Authorization')
    if (!token) {
      return c.json({ error: 'missing CF-Access-Jwt-Assertion header' }, 401)
    }

    let email: string | null
    try {
      email = await verifyCfAccessJwt(token, config, keySet)
    } catch {
      return c.json({ error: 'invalid jwt: verification failed' }, 401)
    }

    if (!email) {
      return c.json({ error: 'invalid jwt: cannot extract email claim' }, 401)
    }

    c.set('auth', { userId: email })
    await next()
  }
}

export function getAuth(c: Context<{ Variables: AuthVariables }>): AuthContext {
  const auth = c.get('auth')
  if (!auth) {
    throw new Error('auth middleware did not run')
  }
  return auth
}

export interface CfAccessConfig {
  /** Cloudflare Access team domain, e.g. `https://myteam.cloudflareaccess.com`. */
  teamDomain: string
  /** Application AUD tag — the expected `aud` claim. */
  aud: string
}

/**
 * Normalize a configured team domain to its issuer origin.
 *
 * Accepts `myteam.cloudflareaccess.com` or `https://myteam.cloudflareaccess.com`
 * and returns the origin (`https://myteam.cloudflareaccess.com`), which is the
 * exact `iss` value Cloudflare Access stamps on every assertion.
 */
export function cfAccessIssuer(teamDomain: string): string {
  const url = teamDomain.includes('://') ? new URL(teamDomain) : new URL(`https://${teamDomain}`)
  return url.origin
}

/** URL of the team's JWKS endpoint. */
export function cfAccessCertsUrl(teamDomain: string): URL {
  return new URL('/cdn-cgi/access/certs', `${cfAccessIssuer(teamDomain)}/`)
}

// Cache one remote JWKS resolver per certs URL. `createRemoteJWKSet` fetches
// lazily on first verify and caches keys internally with cooldown/rotation, so
// this avoids a network round-trip per request.
const remoteJwksCache = new Map<string, JWTVerifyGetKey>()

function remoteJwks(teamDomain: string): JWTVerifyGetKey {
  const url = cfAccessCertsUrl(teamDomain)
  const key = url.toString()
  let set = remoteJwksCache.get(key)
  if (!set) {
    set = createRemoteJWKSet(url)
    remoteJwksCache.set(key, set)
  }
  return set
}

/**
 * Clear the cached remote JWKS resolvers. Test-only: lets suites that stub the
 * JWKS fetch with fresh key material avoid picking up a resolver cached by an
 * earlier test.
 */
export function __resetJwksCacheForTests(): void {
  remoteJwksCache.clear()
}

/**
 * Verify a Cloudflare Access assertion and return its `email` claim.
 *
 * Enforces RS256 signature (via the supplied JWKS resolver, keyed by `kid`),
 * `iss` = team domain, `aud` = app AUD tag, and `exp`/`nbf` (handled by
 * `jwtVerify`). Throws if verification fails. Returns null only when the token
 * is valid but carries no usable `email` claim.
 *
 * The JWKS resolver is injected so tests can supply a local key set and prod
 * uses the cached remote one.
 */
export async function verifyCfAccessJwt(
  token: string,
  config: CfAccessConfig,
  keySet: JWTVerifyGetKey,
): Promise<string | null> {
  const { payload } = await jwtVerify(token, keySet, {
    issuer: cfAccessIssuer(config.teamDomain),
    audience: config.aud,
    algorithms: ['RS256'],
  })
  return typeof payload.email === 'string' ? payload.email : null
}
