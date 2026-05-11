import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SyncStatus } from './SyncStatus'

describe('<SyncStatus>', () => {
  it('renders offline state', () => {
    render(<SyncStatus status={{ state: 'offline', lastSyncAt: null, errorMessage: null }} />)
    const el = screen.getByRole('status')
    expect(el).toHaveAttribute('data-sync-state', 'offline')
    expect(el.textContent).toMatch(/offline/i)
  })

  it('renders syncing state', () => {
    render(<SyncStatus status={{ state: 'syncing', lastSyncAt: null, errorMessage: null }} />)
    const el = screen.getByRole('status')
    expect(el).toHaveAttribute('data-sync-state', 'syncing')
    expect(el.textContent).toMatch(/syncing/i)
  })

  it('renders synced state with a relative time', () => {
    const now = 1_700_000_000_000
    const twoMinutesAgo = now - 2 * 60_000
    render(
      <SyncStatus
        status={{ state: 'synced', lastSyncAt: twoMinutesAgo, errorMessage: null }}
        now={now}
      />,
    )
    const el = screen.getByRole('status')
    expect(el).toHaveAttribute('data-sync-state', 'synced')
    expect(el.textContent).toMatch(/synced/i)
    // Intl.RelativeTimeFormat with `numeric: 'auto'` yields "2 minutes ago"
    // in en-US; just assert "minute" appears so this isn't locale-flaky.
    expect(el.textContent?.toLowerCase()).toMatch(/minute|ago/)
  })

  it('renders error state with tooltip message', () => {
    render(<SyncStatus status={{ state: 'error', lastSyncAt: null, errorMessage: 'HTTP 500' }} />)
    const el = screen.getByRole('status')
    expect(el).toHaveAttribute('data-sync-state', 'error')
    expect(el).toHaveAttribute('title', 'HTTP 500')
    expect(el.textContent).toMatch(/sync error/i)
  })

  it('falls back to default tooltip when errorMessage is null in error state', () => {
    render(<SyncStatus status={{ state: 'error', lastSyncAt: null, errorMessage: null }} />)
    expect(screen.getByRole('status')).toHaveAttribute('title', 'Sync error')
  })
})
