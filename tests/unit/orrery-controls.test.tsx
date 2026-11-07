/**
 * The orrery's controls (#91): the time bar (spec Part 7), the body search combobox and
 * the inspector (Parts 10, 16).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildCatalog } from '@/components/orrery/catalog'
import { Inspector } from '@/components/orrery/Inspector'
import { SearchBox } from '@/components/orrery/SearchBox'
import { TimeBar } from '@/components/orrery/TimeBar'
import { parseHorizonsVectors } from '@/lib/horizons'
import type { OrreryTrack } from '@/schemas/orreryBodies'
import { simTimeAt, useOrreryClock } from '@/store/orreryClock'

const T0 = Date.parse('2026-11-06T00:00:00Z')
const DAY = 86_400_000

afterEach(cleanup)

describe('TimeBar (#91)', () => {
  beforeEach(() => {
    useOrreryClock.getState().setSimTime(T0)
    useOrreryClock.getState().pause()
  })

  const sim = () => simTimeAt(useOrreryClock.getState(), Date.now())

  it('steps a day with the arrow keys and a week with shift', () => {
    render(<TimeBar now={() => T0} />)
    const slider = screen.getByRole('slider', { name: /date/i })
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(sim()).toBe(T0 + DAY)
    fireEvent.keyDown(slider, { key: 'ArrowLeft', shiftKey: true })
    expect(sim()).toBe(T0 + DAY - 7 * DAY)
  })

  it('plays and pauses, and picks a playback rate', () => {
    render(<TimeBar now={() => T0} />)
    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    expect(useOrreryClock.getState().playing).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: /1 day\/s/i }))
    expect(useOrreryClock.getState().rate).toBe(86_400)
    fireEvent.click(screen.getByRole('button', { name: /pause/i }))
    expect(useOrreryClock.getState().playing).toBe(false)
  })

  it('jumps to a typed date, including BC, and refuses one outside 3000 BC – 3000 AD', () => {
    render(<TimeBar now={() => T0} />)
    const field = screen.getByRole('textbox', { name: /go to date/i })
    fireEvent.change(field, { target: { value: '-1000-03-01' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(new Date(sim()).getUTCFullYear()).toBe(-1000)
    fireEvent.change(field, { target: { value: '4000-01-01' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(field.getAttribute('aria-invalid')).toBe('true')
  })

  it('Now returns to the present at 1x', () => {
    render(<TimeBar now={() => T0 + 5 * DAY} />)
    fireEvent.click(screen.getByRole('button', { name: /^now$/i }))
    expect(useOrreryClock.getState().rate).toBe(1)
    expect(useOrreryClock.getState().playing).toBe(true)
  })
})

describe('SearchBox (#91)', () => {
  it('is a combobox that filters bodies and selects with the keyboard', () => {
    const onSelect = vi.fn()
    render(<SearchBox onSelect={onSelect} />)
    const box = screen.getByRole('combobox', { name: /find/i })
    fireEvent.change(box, { target: { value: 'ma' } })
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toContain('Mars')
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('Mars')
  })

  it('selects with a click and closes on Escape', () => {
    const onSelect = vi.fn()
    render(<SearchBox onSelect={onSelect} />)
    const box = screen.getByRole('combobox', { name: /find/i })
    fireEvent.change(box, { target: { value: 'sat' } })
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Saturn' }))
    expect(onSelect).toHaveBeenCalledWith('Saturn')
    fireEvent.change(box, { target: { value: 'ne' } })
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

describe('Inspector (#91)', () => {
  it('shows source, model label, distances, light time and confidence reasons', () => {
    render(<Inspector body="Mars" simMs={T0} onClose={() => undefined} />)
    expect(screen.getByRole('heading', { name: 'Mars' })).toBeTruthy()
    expect(screen.getByText(/Kepler approximation/i)).toBeTruthy()
    expect(screen.getAllByText(/Table 1/).length).toBeGreaterThan(0)
    expect(screen.getByText('From Earth')).toBeTruthy()
    expect(screen.getByText('Light time')).toBeTruthy()
    expect(screen.getAllByText(/^(approaching|receding)$/).length).toBe(1)
    expect(screen.getAllByText(/JPL's stated error/).length).toBeGreaterThan(0)
  })

  it('describes the Sun without inventing a model state', () => {
    render(<Inspector body="Sun" simMs={T0} onClose={() => undefined} />)
    expect(screen.getByRole('heading', { name: 'Sun' })).toBeTruthy()
    expect(screen.getByText(/origin of this view/i)).toBeTruthy()
  })
})

/** Real Horizons samples (2026-11-05..07) as a track, for the craft inspector (#93). */
function fixtureTrack(
  file: string,
  naifId: string,
  name: string,
  extra: Partial<OrreryTrack> = {},
) {
  const samples =
    parseHorizonsVectors(
      readFileSync(join(__dirname, 'fixtures', 'horizons', `${file}.txt`), 'utf8'),
    )?.samples ?? []
  const track: OrreryTrack = {
    id: `naif:${naifId}`,
    naifId,
    name,
    mission: 'Voyager (NASA/JPL)',
    category: 'spacecraft',
    group: 'deep-space',
    target: `${name} (spacecraft) (${naifId})`,
    observedUntil: '1992-04-24',
    availableFrom: null,
    availableTo: null,
    fine: {
      start: samples[0]?.jd ?? 0,
      step: 0.5,
      samples: samples.flatMap((s) => [s.x, s.y, s.z, s.vx, s.vy, s.vz]),
    },
    coarse: null,
    ...extra,
  }
  return track
}

describe('SearchBox with spacecraft (#93)', () => {
  const items = buildCatalog(
    [
      fixtureTrack('voyager1', '-31', 'Voyager 1'),
      fixtureTrack('jwst', '-170', 'JWST', { fine: null }),
    ],
    2461350.5,
  )

  it('finds a craft and selects it by its id', () => {
    const onSelect = vi.fn()
    render(<SearchBox items={items} onSelect={onSelect} />)
    const box = screen.getByRole('combobox', { name: /find/i })
    fireEvent.change(box, { target: { value: 'voy' } })
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Voyager 1' }))
    expect(onSelect).toHaveBeenCalledWith('naif:-31')
  })

  it('keeps a craft with no data at the date, marked', () => {
    render(<SearchBox items={items} onSelect={() => undefined} />)
    fireEvent.change(screen.getByRole('combobox', { name: /find/i }), { target: { value: 'jw' } })
    expect(screen.getByRole('option').textContent).toMatch(/JWST · no data for this date/)
  })
})

describe('Inspector for a spacecraft (#93)', () => {
  const v1 = fixtureTrack('voyager1', '-31', 'Voyager 1')
  const earth = fixtureTrack('earth', '399', 'Earth', { category: 'planet', group: 'planet' })
  const SIM = Date.parse('2026-11-06T00:00:00Z')

  it('shows Horizons as the source, a prediction label, light time and DSN contact', () => {
    render(
      <Inspector
        body="naif:-31"
        simMs={SIM}
        tracks={[earth, v1]}
        dsn={new Map([['-31', { station: 'Canberra', dish: 'DSS43', bands: ['X'] }]])}
        onClose={() => undefined}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Voyager 1' })).toBeTruthy()
    expect(screen.getByText('JPL Horizons')).toBeTruthy()
    expect(screen.getByText(/a prediction past tracking data/i)).toBeTruthy()
    expect(screen.getByText('Light time')).toBeTruthy()
    // About 23.7 hours of light from Earth.
    expect(screen.getByText(/^23 h \d+ min$/)).toBeTruthy()
    expect(screen.getAllByText(/^(approaching|receding)$/)).toHaveLength(1)
    expect(screen.getByText(/In contact now: Canberra, DSS43/)).toBeTruthy()
  })

  it('says there is no data for a date the samples do not cover', () => {
    render(
      <Inspector
        body="naif:-31"
        simMs={SIM + 30 * DAY}
        tracks={[earth, v1]}
        onClose={() => undefined}
      />,
    )
    expect(screen.getByRole('status').textContent).toMatch(/No data for this date/)
    expect(screen.queryByText('Light time')).toBeNull()
  })
})
