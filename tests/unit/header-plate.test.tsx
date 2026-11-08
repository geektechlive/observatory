/**
 * The header plate (#63): the prototype's plain hull plate replaces the Belter header.
 * Name, one-line subtitle, UTC and local clocks, "LIVE, N feeds", About and quota.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { HeaderPlate } from '@/components/status-bar/HeaderPlate'
import { VIEW_HEADLINES } from '@/lib/health'
import { useUiStore } from '@/store/ui'

afterEach(cleanup)

beforeEach(() => {
  useUiStore.setState({ sourceHealth: {} })
})

describe('HeaderPlate', () => {
  it('is the page banner, with the name as the heading and a one-line subtitle', () => {
    render(<HeaderPlate />)
    const banner = screen.getByRole('banner')
    expect(banner).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: /observatory/i })).toBeTruthy()
    expect(screen.getByText('Earth watch, live NASA and NOAA feeds')).toBeTruthy()
  })

  it('drops the Belter flavour lines', () => {
    render(<HeaderPlate />)
    expect(screen.queryByText(/TYCHO|BELTALOWDA|OBS-04/)).toBeNull()
  })

  it('keeps About and the quota meter', () => {
    render(<HeaderPlate />)
    expect(screen.getByRole('button', { name: /about observatory/i })).toBeTruthy()
  })

  it('reads "Live, N feeds" once every headline source of the view is healthy (#178)', () => {
    useUiStore.setState({
      view: 'sun',
      sourceHealth: Object.fromEntries(VIEW_HEADLINES.sun.map((s) => [s, 'ok'])),
    })
    render(<HeaderPlate />)
    const status = screen.getByRole('status')
    expect(status.textContent).toBe(`Live, ${String(VIEW_HEADLINES.sun.length)} feeds`)
  })

  it('judges the view on screen, not feeds other views fetch (#178)', () => {
    useUiStore.setState({
      view: 'sky',
      // Earth's quakes and the Sun's geomag failing earlier in the session don't count here.
      sourceHealth: {
        quakes: 'error',
        geomag: 'error',
        ...Object.fromEntries(VIEW_HEADLINES.sky.map((s) => [s, 'ok'])),
      },
    })
    render(<HeaderPlate />)
    expect(screen.getByRole('status').textContent).toBe(
      `Live, ${String(VIEW_HEADLINES.sky.length)} ${VIEW_HEADLINES.sky.length === 1 ? 'feed' : 'feeds'}`,
    )
  })

  it('reads Syncing before the feeds have reported', () => {
    render(<HeaderPlate />)
    expect(screen.getByRole('status').textContent).toBe('Syncing')
  })
})
