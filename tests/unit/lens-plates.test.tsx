/** The plates under the lens, the live chip's feed count, and the voice feed adapter (#63). */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { IssPlate } from '@/components/lens/IssPlate'
import { SubsolarPlate, type SubsolarPlateHandle } from '@/components/lens/SubsolarPlate'
import { LiveIndicator } from '@/components/status-bar/LiveIndicator'
import { toFeed } from '@/lib/voice'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const base = {
  intervalMs: 200,
  mapMode: 'globe' as const,
  onMapMode: () => undefined,
}

describe('IssPlate', () => {
  it('shows altitude, speed in km/s and the ground point with hemispheres', () => {
    render(<IssPlate {...base} lat={-12.5} lon={-139.3} altKm={421.04} velKmH={27_576} />)
    expect(screen.getByText('421.0')).toBeTruthy()
    expect(screen.getByText('7.66')).toBeTruthy()
    expect(screen.getByText(/over 12\.5°S 139\.3°W/)).toBeTruthy()
    expect(screen.getByText(/5 Hz SGP4/)).toBeTruthy()
  })

  it('reads acquiring before the first fix, and says when motion is reduced', () => {
    render(
      <IssPlate
        {...base}
        intervalMs={1000}
        lat={undefined}
        lon={undefined}
        altKm={undefined}
        velKmH={undefined}
      />,
    )
    expect(screen.getByText(/acquiring/)).toBeTruthy()
    expect(screen.getByText(/reduced motion/)).toBeTruthy()
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('northern and eastern positions read N and E', () => {
    render(<IssPlate {...base} lat={34} lon={83.9} altKm={420} velKmH={27_000} />)
    expect(screen.getByText(/over 34\.0°N 83\.9°E/)).toBeTruthy()
  })

  it('switches between the globe and the map', () => {
    const onMapMode = vi.fn()
    render(<IssPlate {...base} onMapMode={onMapMode} lat={0} lon={0} altKm={420} velKmH={27_000} />)
    const group = screen.getByRole('group', { name: 'Map view mode' })
    expect(group.querySelector('[aria-pressed="true"]')?.textContent).toBe('Globe')
    fireEvent.click(screen.getByRole('button', { name: 'Map' }))
    expect(onMapMode).toHaveBeenCalledWith('map')
  })
})

describe('SubsolarPlate', () => {
  it('shows the sub-solar point and writes the facing through its handle', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T16:40:00Z'))
    const ref = createRef<SubsolarPlateHandle>()
    render(<SubsolarPlate ref={ref} />)
    expect(screen.getByText(/70\.0°W/)).toBeTruthy()
    ref.current?.setFacing(-133.25)
    expect(screen.getByText('133.3°W')).toBeTruthy()
    ref.current?.setFacing(12)
    expect(screen.getByText('12.0°E')).toBeTruthy()
  })
})

describe('LiveIndicator feed count', () => {
  it('says "feed" for one and "feeds" for more, and only while live', () => {
    const { rerender } = render(<LiveIndicator status="live" feeds={1} />)
    expect(screen.getByRole('status').textContent).toBe('Live, 1 feed')
    rerender(<LiveIndicator status="live" feeds={7} />)
    expect(screen.getByRole('status').textContent).toBe('Live, 7 feeds')
    rerender(<LiveIndicator status="degraded" feeds={7} />)
    expect(screen.getByRole('status').textContent).toBe('Degraded')
  })
})

describe('toFeed', () => {
  it('prefers data, then an error, and is otherwise loading', () => {
    const pick = (n: number) => n * 2
    expect(toFeed({ data: 2, isLoading: false, error: null }, pick)).toEqual({
      state: 'ok',
      data: 4,
    })
    expect(toFeed({ data: 2, isLoading: false, error: new Error('x') }, pick)).toEqual({
      state: 'ok',
      data: 4,
    })
    expect(toFeed({ data: undefined, isLoading: false, error: new Error('x') }, pick)).toEqual({
      state: 'error',
    })
    expect(toFeed({ data: undefined, isLoading: true, error: null }, pick)).toEqual({
      state: 'loading',
    })
  })
})
