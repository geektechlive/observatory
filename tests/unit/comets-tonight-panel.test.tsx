/**
 * The Tonight panel's comet list (#99): what is up in the dark from here, with honest
 * words about how uncertain a comet's brightness is.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CometsTonight } from '@/components/panels/CometsTonight'
import type { TonightComet } from '@/schemas/cometsTonight'

import fixture from './fixtures/tonight/c2024t5-kittpeak.json'

const t5 = {
  id: 'sb:1004035',
  name: fixture.comet.name,
  interstellar: false,
  m1: fixture.comet.m1,
  k1: fixture.comet.k1,
  fine: fixture.comet.fine,
  coarse: null,
} satisfies TonightComet

const query = vi.hoisted((): { result: { data: unknown; error: Error | null } } => ({
  result: { data: undefined, error: null },
}))
vi.mock('@/hooks/useCometsTonight', () => ({ useCometsTonight: () => query.result }))

const [lonText, latText] = fixture.siteGeodetic.split(',')
const KITT_PEAK = { lat: Number(latText), lon: Number(lonText) - 360 }
const NOW = new Date('2026-11-07T02:00:00Z')
const DARK = { start: new Date('2026-11-07T02:00:00Z'), end: new Date('2026-11-07T12:00:00Z') }

/** The panel's local clock format. */
const hhmm = (d: Date) =>
  d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

/** /api/comets-tonight's answer (#135): comets and interstellar objects in one list. */
const JD_UNIX = 2440587.5
const jd = (d: Date) => d.getTime() / 86_400_000 + JD_UNIX
/** The slice's spans run from a day before the refresh to a week after (#135). */
const WINDOW = { fromJd: jd(NOW) - 1, toJd: jd(NOW) + 7 }
const payload = (comets: unknown[], interstellar: unknown[] = [], window = WINDOW) => ({
  data: { comets: [...comets, ...interstellar], window },
  error: null,
})

afterEach(() => {
  cleanup()
  query.result = { data: undefined, error: null }
})

describe('CometsTonight', () => {
  it('lists a comet that is up in the dark, with when, where and what it takes', () => {
    query.result = payload([t5])
    render(<CometsTonight coords={KITT_PEAK} dark={DARK} now={NOW} />)
    const item = screen.getByRole('listitem')
    expect(item.textContent).toContain('C/2024 T5 (ATLAS)')
    expect(item.textContent).toMatch(/S 1\d\d°/)
    expect(item.textContent).toMatch(/\d+° up/)
    expect(item.textContent).toMatch(/mag 13\.\d/)
    expect(item.textContent).toMatch(/8-inch telescope/)
  })

  it('warns in one short sentence that comet brightness is a forecast (#134)', () => {
    query.result = payload([t5])
    render(<CometsTonight coords={KITT_PEAK} dark={DARK} now={NOW} />)
    expect(
      screen.getByText(
        'Brightness is JPL’s forecast, and comets often miss it by a magnitude or two.',
      ),
    ).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/light is spread out/i)
  })

  it('says plainly when nothing is bright enough, and names the brightest one up', () => {
    query.result = payload([{ ...t5, m1: 9 }])
    render(<CometsTonight coords={KITT_PEAK} dark={DARK} now={NOW} />)
    expect(screen.queryByRole('listitem')).toBeNull()
    expect(document.body.textContent).toMatch(/No comet bright enough/i)
    expect(document.body.textContent).toMatch(/brightest one up, C\/2024 T5 \(ATLAS\)/)
  })

  it('says so when it never gets fully dark', () => {
    query.result = payload([t5])
    render(<CometsTonight coords={KITT_PEAK} dark={null} now={NOW} />)
    expect(document.body.textContent).toMatch(/doesn.t get fully dark/i)
  })

  it('counts only the dark that is still ahead', () => {
    query.result = payload([t5])
    // From 11:50 only ten minutes of darkness are left, and T5 is past its best.
    render(<CometsTonight coords={KITT_PEAK} dark={DARK} now={new Date('2026-11-07T11:50:00Z')} />)
    const item = screen.queryByRole('listitem')
    expect(item?.textContent ?? '').toMatch(/^C\/2024 T5/)
    expect(item?.textContent).toContain(`best ${hhmm(new Date('2026-11-07T11:50:00Z'))}`)
  })

  it('marks an interstellar object', () => {
    query.result = payload([], [{ ...t5, id: 'sb:x', name: '3I/ATLAS', interstellar: true, m1: 5 }])
    render(<CometsTonight coords={KITT_PEAK} dark={DARK} now={NOW} />)
    expect(screen.getByRole('listitem').textContent).toMatch(/interstellar/i)
  })

  it('says the data is out of date, not that nothing is up, once the night outruns the slice (#135)', () => {
    // A copy left stale by a long refresh outage: its spans end before tonight's dark does.
    query.result = payload([t5], [], { fromJd: jd(NOW) - 8, toJd: jd(DARK.start) + 0.1 })
    render(<CometsTonight coords={KITT_PEAK} dark={DARK} now={NOW} />)
    expect(screen.queryByRole('listitem')).toBeNull()
    expect(document.body.textContent).toMatch(/comet data is out of date/i)
    expect(document.body.textContent).not.toMatch(/No comet bright enough/i)
  })

  it('says when the comet data is unavailable', () => {
    query.result = { data: undefined, error: new Error('503') }
    render(<CometsTonight coords={KITT_PEAK} dark={DARK} now={NOW} />)
    expect(document.body.textContent).toMatch(/comet data is unavailable/i)
  })
})
