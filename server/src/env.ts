import { z } from 'zod'

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_MODE: z.enum(['single-user', 'jwt']).default('single-user'),
  SINGLE_USER_ID: z.string().min(1).default('local'),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Cloudflare Access (used only when AUTH_MODE=jwt). The team domain hosts the
  // JWKS at `<team-domain>/cdn-cgi/access/certs` and is the `iss` of every
  // assertion; the AUD tag identifies this specific Access application and is
  // the `aud` claim. Both are REQUIRED in jwt mode — the auth middleware fails
  // closed (rejects every request) when either is unset. See README.md.
  CF_ACCESS_TEAM_DOMAIN: z.string().min(1).optional(),
  CF_ACCESS_AUD: z.string().min(1).optional(),
})

export type Env = z.infer<typeof EnvSchema>

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid environment: ${issues}`)
  }
  return result.data
}
