/**
 * The sky view for one object (#99 item 5): an alt-az dome, east on the left, with the
 * night's track, a marker, the twilight band, and the same facts as text.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SkyViewPanel } from '@/components/panels/SkyViewPanel'
import { useUiStore } from '@/store/ui'

import fixture from './fixtures/tonight/c2024t5-kittpeak.json'

const query = vi.hoisted((): { result: { data: unknown; error: Error | null } } => ({
  result: { data: undefined, error: null },
}))
vi.mock('@/hooks/useCometsTonight', () => ({ useCometsTonight: () => query.result }))

const [lonText, latText] = fixture.siteGeodetic.split(',')
const KITT_PEAK = { lat: Number(latText), lon: Number(lonText) - 360, isFallback: false }
/** 2026-11-07 at Kitt Peak (UTC-7): 19:00 local is 02:00 UTC on the 8th... the night spans it. */
const NIGHT_T = '2026-11-08T05:00:00Z'

const t5 = {
  id: 'sb:1004035',
  name: fixture.comet.name,
  interstellar: false,
  m1: fixture.comet.m1,
  k1: fixture.comet.k1,
  fine: fixture.comet.fine,
  coarse: null,
}
const vesta = {
  id: 'sb:20000004',
  spkid: '20000004',
  name: '4 Vesta',
  h: 3.2,
  g: 0.32,
  gAssumed: false,
  elements: { epochJd: null, e: 0.09, q: 2.15, tp: 2458247.8, om: 103.8, w: 150.8, i: 7.14 },
  fine: fixture.comet.fine,
}
const slice = (comets: unknown[], asteroids: unknown[]) => ({
  data: { comets, asteroids, window: { fromJd: 2461321.5, toJd: 2461381.5 } },
  error: null,
})

beforeEach(() => {
  // jsdom has no scrollIntoView; the panel scrolls itself in when it opens.
  Element.prototype.scrollIntoView = vi.fn()
  // jsdom has no geolocation; the ask only offers its button where the browser has one.
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition: vi.fn() },
    configurable: true,
  })
  window.history.replaceState(null, '', '/')
  useUiStore.setState({ observer: KITT_PEAK, geoStatus: 'granted' })
  query.result = slice([t5], [vesta])
})

afterEach(() => {
  cleanup()
  query.result = { data: undefined, error: null }
  window.history.replaceState(null, '', '/')
})

const open = (hash: string, state: unknown = null) => {
  window.history.replaceState(state, '', hash)
  return render(<SkyViewPanel />)
}
/** The orrery's button leaves this in the history entry (orrery/skyViewLink.ts). */
const FROM_ORRERY = { skyFrom: 'orrery' }

describe('SkyViewPanel', () => {
  it('renders nothing without a target', () => {
    const { container } = open('#sky')
    expect(container.textContent).toBe('')
  })

  it('asks for a location, and says what it is for, when none is shared', () => {
    useUiStore.setState({ observer: null, geoStatus: null })
    open('#sky?target=sbc:20000004')
    expect(screen.getByText(/needs your location/i)).toBeTruthy()
    // The Tonight panel, beside this view, sends a shared location to Open-Meteo: say so.
    expect(screen.getByText(/Tonight panel sends it to Open-Meteo/i)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/sends it nowhere/i)
    expect(screen.getByRole('button', { name: /use my location/i })).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('treats the Greenwich stand-in as no location', () => {
    useUiStore.setState({ observer: { lat: 51.4779, lon: 0, isFallback: true } })
    open('#sky?target=sbc:20000004')
    expect(screen.getByRole('button', { name: /use my location/i })).toBeTruthy()
  })

  it('draws the dome for a target in the Tonight data, with east on the left', () => {
    open(`#sky?target=sbc:20000004&t=${NIGHT_T}`)
    const dome = screen.getByRole('img', { name: /4 Vesta/ })
    expect(dome).toBeTruthy()
    const east = screen.getByTestId('compass-E')
    const west = screen.getByTestId('compass-W')
    const north = screen.getByTestId('compass-N')
    expect(parseFloat(east.style.left)).toBeLessThan(50)
    expect(parseFloat(west.style.left)).toBeGreaterThan(50)
    expect(parseFloat(north.style.top)).toBeLessThan(50)
    expect(dome.querySelectorAll('polyline').length).toBeGreaterThan(0)
  })

  it('shows the sky for the time in the link as text too: summary and hour by hour', () => {
    open(`#sky?target=sbc:20000004&t=${NIGHT_T}`)
    expect(document.body.textContent).toMatch(/above 10° \d\d:\d\d–\d\d:\d\d/i)
    expect(document.body.textContent).toMatch(/between sunset and sunrise/i)
    const rows = screen.getAllByTestId('sky-hour')
    expect(rows.length).toBeGreaterThan(5)
    expect(rows[0]?.textContent).toMatch(/\d\d:00/)
    expect(rows.some((r) => /\d+° up, [NESW]{1,3} /.test(r.textContent))).toBe(true)
    expect(screen.getByText(/local times/i)).toBeTruthy()
  })

  it('finds a comet by the same key the orrery uses', () => {
    open(`#sky?target=sbc:1004035&t=${NIGHT_T}`)
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain(fixture.comet.name)
  })

  it('says the sky was drawn for the orrery’s time when opened, in local time and UTC', () => {
    open(`#sky?target=sbc:20000004&t=${NIGHT_T}`, FROM_ORRERY)
    expect(screen.getByTestId('sky-marker')).toBeTruthy()
    const when = screen.getByTestId('sky-when').textContent
    expect(when).toMatch(/orrery’s time when you opened this/i)
    expect(when).toMatch(/\d\d:\d\d local/)
    expect(when).toMatch(/\d\d:\d\d UTC/)
    expect(screen.getByRole('button', { name: /^now$/i })).toBeTruthy()
  })

  it('does not claim the orrery for a pasted link with a time', () => {
    open(`#sky?target=sbc:20000004&t=${NIGHT_T}`)
    const when = screen.getByTestId('sky-when').textContent
    expect(when).toMatch(/the sky at .*\d\d:\d\d local/i)
    expect(when).not.toMatch(/orrery/i)
    expect(screen.getByRole('button', { name: /^now$/i })).toBeTruthy()
  })

  it('moves focus to the panel heading when it opens', () => {
    open(`#sky?target=sbc:20000004&t=${NIGHT_T}`)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: /4 Vesta/ }))
  })

  it('on Close returns focus to the link that opened it', () => {
    const opener = document.createElement('a')
    opener.href = '#sky?target=sbc:20000004'
    opener.textContent = 'Sky view of 4 Vesta'
    document.body.append(opener)
    opener.focus()
    open(`#sky?target=sbc:20000004&t=${NIGHT_T}`)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('on Close falls back to the selected console tab when the opener is gone', () => {
    const tab = document.createElement('button')
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-selected', 'true')
    document.body.append(tab)
    const opener = document.createElement('a')
    document.body.append(opener)
    opener.focus()
    open(`#sky?target=sbc:20000004&t=${NIGHT_T}`)
    opener.remove()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(document.activeElement).toBe(tab)
    tab.remove()
  })

  it('says it is before sunset, not daytime, for a moment ahead of the night', () => {
    // 14:00 at Kitt Peak: the coming night is shown.
    open('#sky?target=sbc:20000004&t=2026-11-08T21:00:00Z')
    expect(document.body.textContent).toMatch(/before sunset/i)
    expect(document.body.textContent).not.toMatch(/daytime/i)
  })

  it('"Now" drops the time from the link and keeps the target', () => {
    open(`#sky?target=sbc:20000004&t=${NIGHT_T}`)
    fireEvent.click(screen.getByRole('button', { name: /^now$/i }))
    expect(window.location.hash).toBe('#sky?target=sbc:20000004')
  })

  it('has no Now button when it is already live', () => {
    open('#sky?target=sbc:20000004')
    expect(screen.queryByRole('button', { name: /^now$/i })).toBeNull()
  })

  it('draws nothing and says so when the samples do not cover the night', () => {
    open('#sky?target=sbc:20000004&t=2027-03-01T05:00:00Z')
    const status = screen.getByRole('status')
    expect(status.textContent).toMatch(/never extrapolated/i)
    expect(document.querySelectorAll('polyline')).toHaveLength(0)
    expect(screen.queryByTestId('sky-marker')).toBeNull()
  })

  it('says when the target is not in the Tonight data', () => {
    open(`#sky?target=sbc:20000099&t=${NIGHT_T}`)
    expect(screen.getByText(/isn’t in this week’s Tonight data/i)).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('says it is loading, and when the data failed', () => {
    query.result = { data: undefined, error: null }
    const { unmount } = open('#sky?target=sbc:20000004')
    expect(screen.getByText(/loading/i)).toBeTruthy()
    unmount()
    query.result = { data: undefined, error: new Error('x') }
    render(<SkyViewPanel />)
    expect(screen.getByText(/unavailable/i)).toBeTruthy()
  })

  it('closes back to a bare #sky', () => {
    open(`#sky?target=sbc:20000004&t=${NIGHT_T}`)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(window.location.hash).toBe('#sky')
  })

  it('keeps the twilight band in order, civil to dark', () => {
    open(`#sky?target=sbc:20000004&t=${NIGHT_T}`)
    const band = screen.getByTestId('sky-twilight')
    // The band carries no text of its own: the summary and the hour list do.
    expect(band.getAttribute('aria-hidden')).toBe('true')
    const kinds = within(band)
      .getAllByRole('listitem', { hidden: true })
      .map((li) => li.getAttribute('data-darkness'))
    expect(kinds).toContain('dark')
    expect(kinds[0]).toBe('civil')
  })
})
