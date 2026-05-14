import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OfflineCountdown from './OfflineCountdown'

describe('OfflineCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('renders initial countdown text and tone class', () => {
    const onExpire = vi.fn()
    const now = Date.now()

    render(<OfflineCountdown offlineUntil={now + 30_000} onExpire={onExpire} />)

    expect(screen.getByText('0m 30s')).toBeInTheDocument()
    expect(screen.getByText('0m 30s')).toHaveClass('countdown-soon')
    expect(onExpire).not.toHaveBeenCalled()
  })

  it('updates tone class as time passes', () => {
    const onExpire = vi.fn()
    const now = Date.now()

    const { container } = render(
      <OfflineCountdown offlineUntil={now + 200_000} onExpire={onExpire} />,
    )

    const badge = screen.getByText('3m 20s')
    expect(badge).toHaveClass('countdown-late')

    act(() => {
      vi.advanceTimersByTime(21_000)
    })

    const updatedBadge = container.querySelector('.countdown')
    expect(updatedBadge).not.toBeNull()
    if (!updatedBadge) {
      throw new Error('Countdown element not found')
    }
    expect(updatedBadge).toHaveClass('countdown-mid')
    expect(updatedBadge.textContent).not.toBe('3m 20s')
    expect(onExpire).not.toHaveBeenCalled()
  })

  it('calls onExpire when countdown reaches zero', () => {
    const onExpire = vi.fn()
    const now = Date.now()

    render(<OfflineCountdown offlineUntil={now + 2_000} onExpire={onExpire} />)

    expect(screen.getByText('0m 02s')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2_000)
    })

    expect(onExpire).toHaveBeenCalledTimes(1)
  })
})
