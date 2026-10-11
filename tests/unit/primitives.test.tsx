/**
 * Shared UI primitives (ROCI v2, #39). The audit found panel chrome copied into
 * 21 modules, loading/unavailable/empty states into more than 20, and panel
 * labels rendered as spans, leaving screen-reader heading navigation empty.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Chip } from '@/components/ui/Chip'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Overlay } from '@/components/ui/Overlay'
import { PanelState } from '@/components/ui/PanelState'
import { Readout } from '@/components/ui/Readout'
import { StencilLabel } from '@/components/ui/StencilLabel'
import { Swatch } from '@/components/ui/Swatch'
import { TickRing } from '@/components/ui/TickRing'
import { LANES } from '@/lib/palette'

// vitest runs with globals: false, so Testing Library's auto-cleanup never registers.
afterEach(cleanup)

describe('GlassPanel', () => {
  it('renders its label as a real heading (level 2 by default)', () => {
    render(<GlassPanel label="Solar Wind">body</GlassPanel>)
    expect(screen.getByRole('heading', { level: 2, name: 'Solar Wind' })).toBeTruthy()
  })

  it('takes a heading level for nested panels', () => {
    render(
      <GlassPanel label="Kp" headingLevel={3}>
        body
      </GlassPanel>,
    )
    expect(screen.getByRole('heading', { level: 3, name: 'Kp' })).toBeTruthy()
  })

  it('renders no heading without a label', () => {
    render(<GlassPanel>body</GlassPanel>)
    expect(screen.queryByRole('heading')).toBeNull()
  })
})

describe('Readout', () => {
  it('renders the value and a quieter unit, and exposes its tone', () => {
    const { container } = render(<Readout value="5.33" unit="Kp" tone="watch" />)
    expect(screen.getByText('5.33')).toBeTruthy()
    expect(screen.getByText('Kp')).toBeTruthy()
    expect(container.firstElementChild?.getAttribute('data-tone')).toBe('watch')
  })

  it('omits the unit element when there is no unit', () => {
    const { container } = render(<Readout value="10" />)
    expect(container.querySelectorAll('span').length).toBe(1)
  })
})

describe('PanelState', () => {
  it('announces loading politely', () => {
    render(<PanelState kind="loading" />)
    expect(screen.getByRole('status').textContent).toMatch(/loading/i)
  })

  it('says what is unavailable and why', () => {
    render(<PanelState kind="unavailable" detail="NASA DONKI is not responding" />)
    const status = screen.getByRole('status')
    expect(status.textContent).toMatch(/unavailable/i)
    expect(status.textContent).toMatch(/DONKI/)
  })

  it('renders an empty state with its message', () => {
    render(<PanelState kind="empty" detail="No flares in the last 24 hours" />)
    expect(screen.getByRole('status').textContent).toMatch(/No flares/)
  })
})

describe('Overlay', () => {
  it('renders a tooltip with the tooltip role', () => {
    render(<Overlay kind="tooltip">Wildfire at 35.4°, -118.6°</Overlay>)
    expect(screen.getByRole('tooltip').textContent).toMatch(/Wildfire/)
  })

  it('positions with left/top when given coordinates', () => {
    render(
      <Overlay kind="tooltip" x={12} y={34}>
        x
      </Overlay>,
    )
    const el = screen.getByRole('tooltip')
    expect(el.style.left).toBe('12px')
    expect(el.style.top).toBe('34px')
  })
})

describe('Chip', () => {
  it('is a pressed-state button that reports clicks', () => {
    const onClick = vi.fn()
    render(
      <Chip pressed={false} onClick={onClick}>
        Fires
      </Chip>,
    )
    const button = screen.getByRole('button', { name: 'Fires' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('Swatch', () => {
  it('is decorative and painted with the given colour', () => {
    const { container } = render(<Swatch color={LANES.thermal.emit} />)
    const el = container.firstElementChild as HTMLElement
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(el.style.background).not.toBe('')
  })
})

describe('StencilLabel', () => {
  it('renders its text', () => {
    render(<StencilLabel>Sub-solar</StencilLabel>)
    expect(screen.getByText('Sub-solar')).toBeTruthy()
  })
})

describe('TickRing', () => {
  it('draws one tick per step around the circle, decorative', () => {
    const { container } = render(<TickRing size={100} step={15} major={90} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelectorAll('[data-tick]').length).toBe(24)
    expect(container.querySelectorAll('[data-tick="major"]').length).toBe(4)
  })
})
