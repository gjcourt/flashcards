import { describe, it, expect } from 'vitest'
import { parseEnv } from '../env.js'

describe('parseEnv', () => {
  it('parses a minimal env (DATABASE_URL only)', () => {
    const e = parseEnv({ DATABASE_URL: 'postgres://x' } as NodeJS.ProcessEnv)
    expect(e.DATABASE_URL).toBe('postgres://x')
    expect(e.AUTH_MODE).toBe('single-user')
    expect(e.SINGLE_USER_ID).toBe('local')
    expect(e.PORT).toBe(8080)
  })

  it('throws when DATABASE_URL is missing', () => {
    expect(() => parseEnv({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/)
  })

  it('coerces PORT from a string', () => {
    const e = parseEnv({ DATABASE_URL: 'x', PORT: '3000' } as NodeJS.ProcessEnv)
    expect(e.PORT).toBe(3000)
  })

  it('rejects invalid AUTH_MODE', () => {
    expect(() => parseEnv({ DATABASE_URL: 'x', AUTH_MODE: 'oauth2' } as NodeJS.ProcessEnv)).toThrow(
      /AUTH_MODE/,
    )
  })

  it('accepts AUTH_MODE=jwt', () => {
    const e = parseEnv({ DATABASE_URL: 'x', AUTH_MODE: 'jwt' } as NodeJS.ProcessEnv)
    expect(e.AUTH_MODE).toBe('jwt')
  })
})
