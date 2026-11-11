/** The inspector's "Look closer" button (#203): shown only when asked, reachable by keyboard. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
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

const satellite = {
  key: 'sat:25544',
  noradId: '25544',
  name: 'ISS (ZARYA)',
  group: 'stations' as const,
  epochMs: T0,
  teme: [6800, 0, 0] as [number, number, number],
}

describe('Inspector "Look closer" (#203)', () => {
  it('has no button unless the page says the object has a model', () => {
    render(<Inspector body="naif:-170" simMs={T0} tracks={[jwst]} onClose={() => undefined} />)
    expect(screen.queryByRole('button', { name: /look closer/i })).toBeNull()
  })

  it('shows a button on a craft that opens the view, and says whether it is open', () => {
    const onOpen = vi.fn()
    const ref = createRef<HTMLButtonElement>()
    const { rerender } = render(
      <Inspector
        body="naif:-170"
        simMs={T0}
        tracks={[jwst]}
        onClose={() => undefined}
        lookCloser={{ onOpen, open: false }}
        lookCloserRef={ref}
      />,
    )
    const button = screen.getByRole('button', { name: /look closer/i })
    expect(ref.current).toBe(button)
    expect(button.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(button)
    expect(onOpen).toHaveBeenCalledTimes(1)
    rerender(
      <Inspector
        body="naif:-170"
        simMs={T0}
        tracks={[jwst]}
        onClose={() => undefined}
        lookCloser={{ onOpen, open: true }}
        lookCloserRef={ref}
      />,
    )
    expect(screen.getByRole('button', { name: /look closer/i }).getAttribute('aria-expanded')).toBe(
      'true',
    )
  })

  it('is a real button, so the keyboard reaches it', () => {
    render(
      <Inspector
        body="naif:-170"
        simMs={T0}
        tracks={[jwst]}
        onClose={() => undefined}
        lookCloser={{ onOpen: () => undefined, open: false }}
      />,
    )
    const button = screen.getByRole('button', { name: /look closer/i })
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('type')).toBe('button')
    expect(button.tabIndex).toBe(0)
  })

  it('shows on a satellite too', () => {
    render(
      <Inspector
        body="sat:25544"
        simMs={T0}
        satellite={satellite}
        onClose={() => undefined}
        lookCloser={{ onOpen: () => undefined, open: false }}
      />,
    )
    expect(screen.getByRole('button', { name: /look closer/i })).toBeTruthy()
  })

  it('never shows on a planet, whatever the page passes', () => {
    render(
      <Inspector
        body="Mars"
        simMs={T0}
        onClose={() => undefined}
        lookCloser={{ onOpen: () => undefined, open: false }}
      />,
    )
    expect(screen.queryByRole('button', { name: /look closer/i })).toBeNull()
  })

  it('points at the view it opens with aria-controls, only while that view exists', () => {
    const { rerender } = render(
      <Inspector
        body="naif:-170"
        simMs={T0}
        tracks={[jwst]}
        onClose={() => undefined}
        lookCloser={{ onOpen: () => undefined, open: false }}
      />,
    )
    expect(screen.getByRole('button', { name: /look closer/i }).hasAttribute('aria-controls')).toBe(
      false,
    )
    rerender(
      <Inspector
        body="naif:-170"
        simMs={T0}
        tracks={[jwst]}
        onClose={() => undefined}
        lookCloser={{ onOpen: () => undefined, open: true, controls: 'orrery-detail-view' }}
      />,
    )
    expect(screen.getByRole('button', { name: /look closer/i }).getAttribute('aria-controls')).toBe(
      'orrery-detail-view',
    )
  })
})
