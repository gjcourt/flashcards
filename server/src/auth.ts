import type { Context, MiddlewareHandler } from 'hono'
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
 *   - `jwt`: Reads `CF-Access-Jwt-Assertion` header and extracts the
 *     `email` claim as the user id.
 *
 *     TODO(security): This first cut **does not verify the JWT signature**.
 *     It assumes Cloudflare Access (or an equivalent gateway) is upstream
 *     and has already validated the token before forwarding the request.
 *     If this service is ever exposed without a verifying gateway in front,
 *     signature verification MUST be added here (fetch the CF Access JWKS
 *     and validate via `jose` or `jsonwebtoken`).
 *     See README.md > Auth modes.
 */
export function authMiddleware(env: Env): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    if (env.AUTH_MODE === 'single-user') {
      c.set('auth', { userId: env.SINGLE_USER_ID })
      await next()
      return
    }

    const header = c.req.header('CF-Access-Jwt-Assertion')
    if (!header) {
      return c.json({ error: 'missing CF-Access-Jwt-Assertion header' }, 401)
    }

    const email = extractEmailUnverified(header)
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

/**
 * Decode a JWT payload without verifying the signature.
 *
 * WARNING: Trust this only when an upstream gateway has already verified
 * the token. See the TODO in `authMiddleware`.
 */
export function extractEmailUnverified(jwt: string): string | null {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  const payloadB64 = parts[1]
  if (!payloadB64) return null
  try {
    const json = Buffer.from(payloadB64, 'base64url').toString('utf8')
    const parsed: unknown = JSON.parse(json)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'email' in parsed &&
      typeof (parsed as { email: unknown }).email === 'string'
    ) {
      return (parsed as { email: string }).email
    }
    return null
  } catch {
    return null
  }
}
