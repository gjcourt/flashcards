import { afterEach, describe, expect, it, vi } from 'vitest'

// LOCKED_DECK is evaluated at module load. We re-import after stubbing the
// env var so each test sees the correct value.
async function loadEnv(value: string | undefined) {
  vi.unstubAllEnvs()
  if (value === undefined) {
    vi.stubEnv('VITE_LOCKED_DECK', '')
  } else {
    vi.stubEnv('VITE_LOCKED_DECK', value)
  }
  vi.resetModules()
  return import('./env')
}

describe('LOCKED_DECK', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('is undefined when the env var is unset', async () => {
    const { LOCKED_DECK } = await loadEnv(undefined)
    expect(LOCKED_DECK).toBeUndefined()
  })

  it('is undefined when the env var is whitespace-only', async () => {
    const { LOCKED_DECK } = await loadEnv('   ')
    expect(LOCKED_DECK).toBeUndefined()
  })

  it('returns the trimmed value when set', async () => {
    const { LOCKED_DECK } = await loadEnv('  nato  ')
    expect(LOCKED_DECK).toBe('nato')
  })

  it('returns the value when set without whitespace', async () => {
    const { LOCKED_DECK } = await loadEnv('financial')
    expect(LOCKED_DECK).toBe('financial')
  })
})
