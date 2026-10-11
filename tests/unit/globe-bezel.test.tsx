import { cleanup, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { GlobeBezel, type GlobeBezelHandle } from '@/components/globe/GlobeBezel'
import type { LaneCensus } from '@/lib/census'

afterEach(cleanup)

const CENSUS: LaneCensus[] = [
  { lane: 'orbital', state: 'live', count: 64 },
  { lane: 'thermal', state: 'error', count: 0 },
  { lane: 'space', state: 'off', count: 0 },
  { lane: 'geo', state: 'zero', count: 0 },
  { lane: 'hydro', state: 'stale', count: 3 },
]

describe('GlobeBezel', () => {
  it('draws one census segment per lane, tagged with its state', () => {
    const { container } = render(<GlobeBezel size={460} census={CENSUS} />)
    const segments = [...container.querySelectorAll('[data-lane]')]
    expect(
      segments.map(
        (s) => `${s.getAttribute('data-lane') ?? ''}:${s.getAttribute('data-state') ?? ''}`,
      ),
    ).toEqual(['orbital:live', 'thermal:error', 'space:off', 'geo:zero', 'hydro:stale'])
  })

  it('labels each state differently, so a failed feed never reads as a quiet Earth', () => {
    const { container } = render(<GlobeBezel size={460} census={CENSUS} />)
    const label = (lane: string) =>
      container.querySelector(`[data-lane="${lane}"] text`)?.textContent ?? null
    expect(label('orbital')).toBe('64')
    expect(label('thermal')).toBe('ERR')
    expect(label('space')).toBeNull()
    expect(label('geo')).toBe('0')
  })

  it('summarises the census for screen readers', () => {
    render(<GlobeBezel size={460} census={CENSUS} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      'Live census. Orbital: 64, Thermal: error, Space objects: off, Geophysical: zero, Hydro and weather: stale',
    )
  })

  it('turns the bearing scale to the facing longitude', () => {
    const ref = createRef<GlobeBezelHandle>()
    const { container } = render(<GlobeBezel ref={ref} size={460} census={CENSUS} />)
    ref.current?.setFacing(30)
    const box = 460 + 2 * 38
    expect(container.querySelector('svg > g')?.getAttribute('transform')).toBe(
      `rotate(-30 ${String(box / 2)} ${String(box / 2)})`,
    )
  })
})
