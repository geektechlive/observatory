/**
 * The orrery's controls (#91): the time bar (spec Part 7), the body search combobox and
 * the inspector (Parts 10, 16).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildCatalog } from '@/components/orrery/catalog'
import { Inspector } from '@/components/orrery/Inspector'
import { SearchBox } from '@/components/orrery/SearchBox'
import { TimeBar } from '@/components/orrery/TimeBar'
import { parseHorizonsVectors } from '@/lib/horizons'
import type { OrreryTrack } from '@/schemas/orreryBodies'
import { SIM_MAX_MS, simTimeAt, useOrreryClock } from '@/store/orreryClock'

const T0 = Date.parse('2026-11-06T00:00:00Z')
const DAY = 86_400_000

afterEach(cleanup)

describe('TimeBar (#91)', () => {
  beforeEach(() => {
    // Pause first: set then pause let the running clock add a millisecond between (#121).
    useOrreryClock.getState().pause()
    useOrreryClock.getState().setSimTime(T0)
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

  it('offers a week, a month and a year a second (#114)', () => {
    render(<TimeBar now={() => T0} />)
    fireEvent.click(screen.getByRole('radio', { name: /1 wk\/s/i }))
    expect(useOrreryClock.getState().rate).toBe(7 * 86_400)
    fireEvent.click(screen.getByRole('radio', { name: /1 mo\/s/i }))
    expect(useOrreryClock.getState().rate).toBe(30 * 86_400)
    fireEvent.click(screen.getByRole('radio', { name: /1 yr\/s/i }))
    expect(useOrreryClock.getState().rate).toBe(365 * 86_400)
    expect(useOrreryClock.getState().playing).toBe(true)
  })

  it('re-centres the scrubber on the clock once it leaves the ±1-year window (#114)', () => {
    render(<TimeBar now={() => T0} />)
    const slider = screen.getByRole('slider', { name: /date/i })
    expect(slider.getAttribute('aria-valuetext')).not.toMatch(/beyond/)
    act(() => {
      useOrreryClock.getState().setSimTime(T0 + 3 * 365 * DAY)
    })
    // The window now sits around the clock: the thumb is mid-track, not pinned at an end.
    expect(Number((slider as HTMLInputElement).value)).toBe(0)
    // Dragging moves within the new window, not back to today's.
    fireEvent.change(slider, { target: { value: '10' } })
    expect(sim()).toBe(T0 + 3 * 365 * DAY + 10 * DAY)
  })

  it('pauses on reaching 3000 AD at 1 yr/s, with the planets at the edge (#114)', () => {
    vi.useFakeTimers()
    try {
      const start = SIM_MAX_MS - 100 * DAY
      act(() => {
        useOrreryClock.getState().setSimTime(start)
      })
      render(<TimeBar now={() => T0} />)
      fireEvent.click(screen.getByRole('radio', { name: /1 yr\/s/i }))
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      expect(useOrreryClock.getState().playing).toBe(false)
      expect(sim()).toBe(SIM_MAX_MS)
      expect(screen.getByRole('button', { name: /play/i })).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
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

describe('Inspector imagery labels (#105)', () => {
  it('says what kind of colour a planet shows, its mission and its credit', () => {
    render(<Inspector body="Mercury" simMs={T0} onClose={() => undefined} />)
    expect(screen.getByText('Enhanced colour')).toBeTruthy()
    expect(screen.getByText('MESSENGER MDIS')).toBeTruthy()
    expect(screen.getByText(/USGS Astrogeology/)).toBeTruthy()
  })

  it('credits Björn Jónsson for Saturn', () => {
    render(<Inspector body="Saturn" simMs={T0} onClose={() => undefined} />)
    expect(screen.getByText('True colour')).toBeTruthy()
    expect(screen.getByText(/Björn Jónsson/)).toBeTruthy()
  })

  it('labels Uranus as shaded, not imaged', () => {
    render(<Inspector body="Uranus" simMs={T0} onClose={() => undefined} />)
    expect(screen.getByText('Shaded, no map')).toBeTruthy()
  })

  it('gives the live Sun’s observation time and satellite', () => {
    const frame = {
      url: 'https://services.swpc.noaa.gov/x.png',
      start: new Date('2026-11-07T02:20:00Z'),
      end: new Date('2026-11-07T02:24:00Z'),
      satellite: 'GOES-19',
    }
    const image = {} as HTMLImageElement
    render(
      <Inspector
        body="Sun"
        simMs={T0}
        onClose={() => undefined}
        sun={{ kind: 'live', frame, image }}
      />,
    )
    expect(screen.getByText('Observed 2026-11-07 02:20–02:24 UTC by GOES-19 SUVI')).toBeTruthy()
    expect(screen.getByText(/171 Å/)).toBeTruthy()
  })

  it('says why the Sun is a flat disc when the live image failed', () => {
    render(
      <Inspector
        body="Sun"
        simMs={T0}
        onClose={() => undefined}
        sun={{ kind: 'fallback', reason: 'The live image did not load.' }}
      />,
    )
    expect(screen.getByText(/Flat disc: The live image did not load\./)).toBeTruthy()
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

  it('credits the NASA 3D model, its page and its orientation, not to scale (#115)', () => {
    render(<Inspector body="naif:-31" simMs={SIM} tracks={[earth, v1]} onClose={() => undefined} />)
    const credit = screen.getByRole('link', { name: /3D model: NASA\/Christopher R\. Meaney/ })
    expect(credit.getAttribute('href')).toBe(
      'https://science.nasa.gov/3d-resources/voyager-probe-a/',
    )
    expect(screen.getByText(/High-gain antenna toward Earth · not to scale/)).toBeTruthy()
  })

  it('calls a stand-in a simplified model (#115)', () => {
    const psyche = fixtureTrack('voyager1', '-255', 'Psyche', { group: 'mission' })
    render(
      <Inspector body="naif:-255" simMs={SIM} tracks={[earth, psyche]} onClose={() => undefined} />,
    )
    expect(screen.getByText(/^Simplified model/)).toBeTruthy()
  })

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

describe('Inspector for a moon (#107)', () => {
  const io = {
    key: 'naif:501',
    name: 'Io',
    parent: 'Jupiter' as const,
    periodDays: 1.77,
    semiMajorAxisKm: 422_000,
    center: "Jupiter's centre (Horizons 500@599)",
    target: 'Io (501)',
    spans: [{ start: 2461340.5, step: 1, samples: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }],
    relative: (jd: number) =>
      jd < 2461351
        ? {
            position: { x: 0.00282, y: 0, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            resolution: 'fine' as const,
          }
        : null,
  }

  it('names its planet, its distance from it, its period, the source, and that the view is not to scale', () => {
    render(<Inspector body="naif:501" simMs={T0} moons={[io]} onClose={() => undefined} />)
    expect(screen.getByRole('heading', { name: 'Io' })).toBeTruthy()
    expect(screen.getByText('Jupiter')).toBeTruthy()
    expect(screen.getByText(/421,8\d\d/)).toBeTruthy()
    expect(screen.getByText(/1\.77 d/)).toBeTruthy()
    expect(screen.getByText(/500@599/)).toBeTruthy()
    expect(screen.getByText(/not to scale/i)).toBeTruthy()
  })

  it('says “no data for this date” outside its window', () => {
    render(
      <Inspector body="naif:501" simMs={T0 + 30 * DAY} moons={[io]} onClose={() => undefined} />,
    )
    expect(screen.getByRole('status').textContent).toMatch(/No data for this date/)
  })

  it('says how its orbit line is drawn: an osculating ellipse when the data is shorter than an orbit', () => {
    // Data for one day of a 1.77-day orbit: too short to sample a whole orbit.
    const w = (2 * Math.PI) / 1.77
    const r = 0.00282
    const short = {
      ...io,
      relative: (jd: number) =>
        jd < 2461351
          ? {
              position: { x: r * Math.cos(w * jd), y: r * Math.sin(w * jd), z: 0 },
              velocity: { x: -r * w * Math.sin(w * jd), y: r * w * Math.cos(w * jd), z: 0 },
              resolution: 'fine' as const,
            }
          : null,
    }
    render(<Inspector body="naif:501" simMs={T0} moons={[short]} onClose={() => undefined} />)
    expect(screen.getByText(/osculating ellipse/i)).toBeTruthy()
  })
})
