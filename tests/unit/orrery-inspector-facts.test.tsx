/** The inspector's "Facts" toggle (#205): the phone sheet folds while Look closer is open. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Inspector } from '@/components/orrery/Inspector'
import type { OrreryTrack } from '@/schemas/orreryBodies'

afterEach(cleanup)

const T0 = Date.parse('2026-11-06T00:00:00Z')

const jwst: OrreryTrack = {
  id: 'naif:-170',
  naifId: '-170',
  name: 'JWST',
  mission: 'James Webb Space Telescope (NASA)',
  category: 'space_telescope',
  group: 'mission',
  target: 'JWST (spacecraft) (-170)',
  observedUntil: null,
  availableFrom: null,
  availableTo: null,
  fine: null,
  coarse: null,
}

const aside = () => screen.getByRole('complementary')

describe('Inspector "Facts" toggle (#205)', () => {
  it('has no Facts button and no state while the detail view is not open', () => {
    render(<Inspector body="naif:-170" simMs={T0} tracks={[jwst]} onClose={() => undefined} />)
    expect(screen.queryByRole('button', { name: 'Facts' })).toBeNull()
    expect(aside().hasAttribute('data-facts')).toBe(false)
  })

  it('shows a collapsed Facts button with aria-expanded false, and marks the sheet collapsed', () => {
    render(
      <Inspector
        body="naif:-170"
        simMs={T0}
        tracks={[jwst]}
        onClose={() => undefined}
        facts={{ open: false, onToggle: () => undefined }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Facts' }).getAttribute('aria-expanded')).toBe(
      'false',
    )
    expect(aside().getAttribute('data-facts')).toBe('collapsed')
  })

  it('says it is expanded when the facts are open, and asks to toggle on a click', () => {
    const onToggle = vi.fn()
    render(
      <Inspector
        body="naif:-170"
        simMs={T0}
        tracks={[jwst]}
        onClose={() => undefined}
        facts={{ open: true, onToggle }}
      />,
    )
    const button = screen.getByRole('button', { name: 'Facts' })
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(aside().getAttribute('data-facts')).toBe('open')
    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('controls the facts region: aria-controls names an element that holds them, not the header', () => {
    render(
      <Inspector
        body="naif:-170"
        simMs={T0}
        tracks={[jwst]}
        onClose={() => undefined}
        lookCloser={{ onOpen: () => undefined, open: false }}
        facts={{ open: false, onToggle: () => undefined }}
      />,
    )
    const button = screen.getByRole('button', { name: 'Facts' })
    const id = button.getAttribute('aria-controls')
    expect(id).toBeTruthy()
    const region = id ? document.getElementById(id) : null
    expect(region).not.toBeNull()
    // It holds the facts and the Look closer button, and not the header with the toggle.
    expect(region?.contains(screen.getByRole('button', { name: /look closer/i }))).toBe(true)
    expect(region?.contains(button)).toBe(false)
    expect(region?.contains(screen.getByRole('heading', { level: 2 }))).toBe(false)
  })

  it('keeps the name and Close in the header row beside it', () => {
    render(
      <Inspector
        body="naif:-170"
        simMs={T0}
        tracks={[jwst]}
        onClose={() => undefined}
        facts={{ open: false, onToggle: () => undefined }}
      />,
    )
    const head = screen.getByRole('heading', { level: 2 }).parentElement
    expect(head?.contains(screen.getByRole('button', { name: 'Facts' }))).toBe(true)
    expect(head?.contains(screen.getByRole('button', { name: 'Close' }))).toBe(true)
  })
})
