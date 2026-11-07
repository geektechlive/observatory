/**
 * The orrery's Earth orbit controls (#98): one switch per kind of satellite, each
 * explained in place (#122: phones have no hover), the three debris clouds behind one
 * switch, Starlink off by default, and a status line that says what is loaded or why
 * nothing is.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ControlRail } from '@/components/orrery/ControlRail'
import { SatControls } from '@/components/orrery/SatControls'
import {
  DEFAULT_SAT_TOGGLES,
  enabledSatGroups,
  SAT_TOGGLES,
  satHiddenNotice,
  satStatusText,
} from '@/components/orrery/satToggles'
import type { SatGroupState, SatSnapshot } from '@/lib/orrery/satController'

afterEach(cleanup)

const loaded = (count: number, ageSeconds = 7200): SatGroupState => ({
  status: 'loaded',
  count,
  degraded: false,
  ageSeconds,
})

const snapshot = (patch: Partial<SatSnapshot>): SatSnapshot => ({
  groups: {},
  total: 0,
  drawn: 0,
  outOfWindow: 0,
  failed: 0,
  passMs: null,
  engine: null,
  ...patch,
})

describe('satellite toggles (#98)', () => {
  it('cover every stored group exactly once, with the debris clouds together', () => {
    const groups = SAT_TOGGLES.flatMap((t) => t.groups)
    expect(new Set(groups).size).toBe(groups.length)
    expect(groups.sort()).toEqual(
      [
        'cosmos-2251-debris',
        'fengyun-1c-debris',
        'gps-ops',
        'iridium-33-debris',
        'other',
        'science',
        'starlink',
        'stations',
        'weather',
      ].sort(),
    )
    expect(SAT_TOGGLES.find((t) => t.id === 'debris')?.groups).toHaveLength(3)
  })

  it('start with Starlink and debris off, and the rest on', () => {
    const on = enabledSatGroups(DEFAULT_SAT_TOGGLES)
    expect(on.has('stations')).toBe(true)
    expect(on.has('other')).toBe(true)
    expect(on.has('starlink')).toBe(false)
    expect(on.has('fengyun-1c-debris')).toBe(false)
  })

  it('say why nothing shows yet, then what is loaded and how old it is', () => {
    expect(
      satStatusText(snapshot({ groups: { stations: { ...loaded(0), status: 'waiting' } } })),
    ).toMatch(/zoom in to Earth/i)
    expect(
      satStatusText(snapshot({ groups: { stations: { ...loaded(0), status: 'loading' } } })),
    ).toMatch(/Loading/)
    expect(
      satStatusText(
        snapshot({
          groups: { stations: loaded(19), other: loaded(5499) },
          total: 5518,
          drawn: 5500,
        }),
      ),
    ).toBe('5,518 satellites from CelesTrak, sampled 2 h ago.')
    // A few objects CelesTrak hasn't updated in over 3 days are left out at any date.
    expect(
      satStatusText(
        snapshot({
          groups: { stations: loaded(19), other: loaded(5499) },
          total: 5518,
          drawn: 5413,
          outOfWindow: 105,
        }),
      ),
    ).toBe(
      '5,518 satellites from CelesTrak, sampled 2 h ago. 105 are left out: their orbit data is more than 3 days from this date.',
    )
    expect(
      satStatusText(
        snapshot({
          groups: { stations: loaded(19), starlink: { ...loaded(0), status: 'error' } },
          total: 19,
          drawn: 19,
        }),
      ),
    ).toMatch(/Starlink is unavailable right now/)
  })
})

describe('the Earth orbit preset and group in the rail (#98)', () => {
  it('is a working preset, and the rail shows the Earth orbit group it is given', () => {
    const onPreset = vi.fn()
    render(
      <ControlRail
        open
        visibility={{ planets: true, orbits: true, labels: true }}
        onVisibility={() => undefined}
        scale="exaggerated"
        onScale={() => undefined}
        preset={null}
        onPreset={onPreset}
        onSelect={() => undefined}
        earthOrbit={
          <SatControls toggles={DEFAULT_SAT_TOGGLES} onToggles={() => undefined} status="x" />
        }
      />,
    )
    const button = screen.getByRole('button', { name: 'Earth orbit' })
    expect((button as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(button)
    expect(onPreset).toHaveBeenCalledWith('orbit')
    expect(screen.getByRole('heading', { name: 'Earth orbit' })).toBeTruthy()
  })
})

describe('satHiddenNotice (#98)', () => {
  it('stays off the stage for the few stale objects, and speaks once the clock moves away', () => {
    expect(satHiddenNotice(105, 5518)).toBeNull()
    expect(satHiddenNotice(4000, 5518)).toMatch(/^4,000 satellites are hidden/)
    expect(satHiddenNotice(5518, 5518)).toMatch(/^Satellites are hidden: .*3 days/)
    expect(satHiddenNotice(0, 0)).toBeNull()
  })
})

describe('<SatControls> (#98)', () => {
  it('explains each switch and reports a change', () => {
    const onToggles = vi.fn()
    render(<SatControls toggles={DEFAULT_SAT_TOGGLES} onToggles={onToggles} status="Loading…" />)
    const starlink = screen.getByRole('switch', { name: 'Starlink' })
    expect(starlink.getAttribute('aria-checked')).toBe('false')
    const hint = document.getElementById(starlink.getAttribute('aria-describedby') ?? '')
    expect(hint?.textContent).toMatch(/SpaceX/)
    fireEvent.click(starlink)
    expect(onToggles).toHaveBeenCalledWith({ ...DEFAULT_SAT_TOGGLES, starlink: true })
    for (const t of SAT_TOGGLES) {
      const sw = screen.getByRole('switch', { name: t.label })
      expect(sw.getAttribute('aria-describedby')).toBeTruthy()
    }
    expect(screen.getByRole('status').textContent).toBe('Loading…')
  })
})
