import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LookupFacts } from '@/components/orrery/LookupFacts'
import type { LookupObject, TrajectoryResponse } from '@/schemas/jplLookup'

afterEach(cleanup)

const apophis: LookupObject = {
  id: 'sb:20099942',
  spkid: '20099942',
  name: '99942 Apophis (2004 MN4)',
  designation: '99942',
  prefix: null,
  kind: 'asteroid',
  orbitClass: { code: 'ATE', name: 'Aten' },
  neo: true,
  pha: true,
}

const DAY_MS = 86_400_000
const START_JD = Date.parse('2025-12-04T00:00:00Z') / DAY_MS + 2440587.5

function trajectory(): TrajectoryResponse {
  const w = 0.0172
  const samples: number[] = []
  for (let i = 0; i < 366; i += 1) {
    const th = w * 2 * i
    samples.push(
      0.92 * Math.cos(th),
      0.92 * Math.sin(th),
      0.02,
      -0.92 * w * Math.sin(th),
      0.92 * w * Math.cos(th),
      0,
    )
  }
  return {
    generatedAt: '2026-11-07T00:00:00Z',
    frame: 'ecliptic-J2000',
    center: 'Sun',
    timeScale: 'TDB',
    units: { position: 'au', velocity: 'au/day' },
    sourceType: 'ephemeris',
    provider: 'jpl-horizons',
    object: apophis,
    target: '99942 Apophis (2004 MN4)',
    request: { start: '2025-12-04', end: '2027-12-04', stepMinutes: 2880 },
    fine: { start: START_JD, step: 2, samples },
    availableFrom: null,
    availableTo: null,
  }
}

const simMs = Date.parse('2026-11-07T00:00:00Z')

describe('LookupFacts (#145)', () => {
  it('says what JPL says about it, where it is, and where the numbers come from', () => {
    render(
      <LookupFacts
        object={apophis}
        trajectory={trajectory()}
        earth={null}
        simMs={simMs}
        problem={null}
        loading={false}
        onRemove={vi.fn()}
      />,
    )
    const text = document.body.textContent
    expect(text).toContain('Asteroid')
    expect(text).toContain('Aten')
    expect(text).toContain('Near-Earth object')
    expect(text).toContain('Potentially hazardous')
    expect(screen.getByText('From the Sun')).toBeDefined()
    expect(screen.getByText('From Earth')).toBeDefined()
    expect(text).toMatch(/approaching|receding/)
    expect(text).toContain('2025-12-04 to 2027-12-04, every 2 days')
    expect(text).toMatch(/asked on demand from JPL/i)
    expect(text).toMatch(/whole orbit.*osculating/i)
  })

  it('never shows a position past its samples, and says so', () => {
    render(
      <LookupFacts
        object={apophis}
        trajectory={trajectory()}
        earth={null}
        simMs={Date.parse('2030-01-01T00:00:00Z')}
        problem={null}
        loading
        onRemove={vi.fn()}
      />,
    )
    expect(screen.queryByText('From the Sun')).toBeNull()
    expect(document.body.textContent).toMatch(/no JPL samples for this date yet/i)
  })

  it('says a failure in plain words, and Remove takes it out', () => {
    const onRemove = vi.fn()
    render(
      <LookupFacts
        object={apophis}
        trajectory={null}
        earth={null}
        simMs={simMs}
        problem="JPL is busy right now. Trying again in 20 s."
        loading={false}
        onRemove={onRemove}
      />,
    )
    expect(screen.getByText('JPL is busy right now. Trying again in 20 s.')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Remove from orrery' }))
    expect(onRemove).toHaveBeenCalledOnce()
  })
})

describe('LookupFacts once JPL stayed busy (#141 review)', () => {
  it('offers Try again, which asks JPL again', () => {
    const onRetry = vi.fn()
    render(
      <LookupFacts
        object={null}
        trajectory={null}
        earth={null}
        simMs={Date.parse('2026-11-07T12:00:00Z')}
        problem="JPL is still busy. Try again in a minute."
        onRetry={onRetry}
        loading={false}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByRole('status').textContent).toBe('JPL is still busy. Try again in a minute.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('has no Try again while retries are still in hand', () => {
    render(
      <LookupFacts
        object={null}
        trajectory={null}
        earth={null}
        simMs={Date.parse('2026-11-07T12:00:00Z')}
        problem="JPL is busy right now. Trying again in 20 s."
        loading={false}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
})
