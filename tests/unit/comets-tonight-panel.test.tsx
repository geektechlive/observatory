/**
 * The Tonight panel's comet list (#99): what is up in the dark from here, with honest
 * words about how uncertain a comet's brightness is.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CometsTonight } from '@/components/panels/CometsTonight'
import type { TonightAsteroid, TonightComet } from '@/schemas/cometsTonight'

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

/** A bright asteroid on T5's samples: H = 0 makes it far brighter than the comet there. */
const vesta = {
  id: 'sb:20000004',
  spkid: '20000004',
  name: '4 Vesta',
  h: 0,
  g: 0.32,
  gAssumed: false,
  elements: { epochJd: null, e: 0.09, q: 2.15, tp: 2458247.8, om: 103.8, w: 150.8, i: 7.14 },
  fine: fixture.comet.fine,
} satisfies TonightAsteroid

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
const payload = (
  comets: unknown[],
  interstellar: unknown[] = [],
  window = WINDOW,
  asteroids: unknown[] = [],
) => ({
  data: { comets: [...comets, ...interstellar], asteroids, window },
  error: null,
})

afterEach(() => {
  cleanup()
  query.result = { data: undefined, error: null }
})

describe('CometsTonight, asteroids (#99 item 4)', () => {
  it('lists an asteroid with when it is above 10 degrees, where, its estimated magnitude and what it takes', () => {
    query.result = payload([], [], WINDOW, [vesta])
    render(<CometsTonight coords={KITT_PEAK} dark={DARK} nautical={DARK} now={NOW} />)
    const item = screen.getByRole('listitem')
    expect(item.textContent).toContain('4 Vesta')
    expect(item.textContent).toMatch(/asteroid/i)
    expect(item.textContent).toMatch(/above 10° \d\d:\d\d–\d\d:\d\d/)
    expect(item.textContent).toMatch(/[NESW]{1,3} \d+° · \d+° up/)
    expect(item.textContent).toMatch(/mag -?\d+\.\d/)
  })

  it('says brightness is an estimate from H and G, with no accuracy figure', () => {
    query.result = payload([], [], WINDOW, [{ ...vesta, gAssumed: true, g: 0.15 }])
    render(<CometsTonight coords={KITT_PEAK} dark={DARK} nautical={DARK} now={NOW} />)
    expect(
      screen.getByText(
        'Asteroid brightness is an estimate from JPL’s H and G (G = 0.15 where JPL has none).',
      ),
    ).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/±|0\.3 mag/)
  })

  it('still lists asteroids on a night with no astronomical dark, and says why comets are missing', () => {
    query.result = payload([t5], [], WINDOW, [vesta])
    render(<CometsTonight coords={KITT_PEAK} dark={null} nautical={DARK} now={NOW} />)
    expect(screen.getByRole('listitem').textContent).toContain('4 Vesta')
    expect(document.body.textContent).toMatch(/doesn.t get fully dark.*no comets/i)
    expect(document.body.textContent).not.toMatch(/C\/2024 T5/)
  })

  it('says so when it never gets dark enough for either', () => {
    query.result = payload([t5], [], WINDOW, [vesta])
    render(<CometsTonight coords={KITT_PEAK} dark={null} nautical={null} now={NOW} />)
    expect(screen.queryByRole('listitem')).toBeNull()
    expect(document.body.textContent).toMatch(/doesn.t get dark enough.*no comets or asteroids/i)
  })

  it('orders comets and asteroids together, brightest first', () => {
    query.result = payload([t5], [], WINDOW, [vesta])
    render(<CometsTonight coords={KITT_PEAK} dark={DARK} nautical={DARK} now={NOW} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]?.textContent).toContain('4 Vesta')
    expect(items[1]?.textContent).toContain('C/2024 T5')
  })

  it('still says no comet is bright enough when asteroids are listed (a quiet comet month)', () => {
    query.result = payload([{ ...t5, m1: 9 }], [], WINDOW, [vesta])
    render(<CometsTonight coords={KITT_PEAK} dark={DARK} nautical={DARK} now={NOW} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(document.body.textContent).toMatch(/No comet bright enough/i)
    expect(document.body.textContent).toMatch(/brightest one up, C\/2024 T5/)
    expect(document.body.textContent).not.toMatch(/No asteroid brighter/i)
  })

  it('says no asteroid is up when none qualifies, besides the comet message', () => {
    query.result = payload([], [], WINDOW, [{ ...vesta, h: 20 }])
    render(<CometsTonight coords={KITT_PEAK} dark={DARK} nautical={DARK} now={NOW} />)
    expect(screen.queryByRole('listitem')).toBeNull()
    expect(document.body.textContent).toMatch(/No asteroid brighter than magnitude 11/i)
  })

  it('says the data is out of date once the night outruns the asteroids too', () => {
    query.result = payload([], [], { fromJd: jd(NOW) - 8, toJd: jd(DARK.start) + 0.1 }, [vesta])
    render(<CometsTonight coords={KITT_PEAK} dark={null} nautical={DARK} now={NOW} />)
    expect(document.body.textContent).toMatch(/data is out of date/i)
    expect(screen.queryByRole('listitem')).toBeNull()
  })
})

describe('CometsTonight', () => {
  it('lists a comet that is up in the dark, with when, where and what it takes', () => {
    query.result = payload([t5])
    render(<CometsTonight coords={KITT_PEAK} dark={DARK} nautical={DARK} now={NOW} />)
    const item = screen.getByRole('listitem')
    expect(item.textContent).toContain('C/2024 T5 (ATLAS)')
    expect(item.textContent).toMatch(/S 1\d\d°/)
    expect(item.textContent).toMatch(/\d+° up/)
    expect(item.textContent).toMatch(/mag 13\.\d/)
    expect(item.textContent).toMatch(/8-inch telescope/)
  })

  it('warns in one short sentence that comet brightness is a forecast (#134)', () => {
    query.result = payload([t5])
    render(<CometsTonight coords={KITT_PEAK} dark={DARK} nautical={DARK} now={NOW} />)
    expect(
      screen.getByText(
        'Comet brightness is JPL’s forecast, and comets often miss it by a magnitude or two.',
      ),
    ).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/light is spread out/i)
  })

  it('says plainly when nothing is bright enough, and names the brightest one up', () => {
    query.result = payload([{ ...t5, m1: 9 }])
    render(<CometsTonight coords={KITT_PEAK} dark={DARK} nautical={DARK} now={NOW} />)
    expect(screen.queryByRole('listitem')).toBeNull()
    expect(document.body.textContent).toMatch(/No comet bright enough/i)
    expect(document.body.textContent).toMatch(/brightest one up, C\/2024 T5 \(ATLAS\)/)
  })

  it('says so when it never gets fully dark', () => {
    query.result = payload([t5])
    render(<CometsTonight coords={KITT_PEAK} dark={null} nautical={DARK} now={NOW} />)
    expect(document.body.textContent).toMatch(/doesn.t get fully dark/i)
  })

  it('counts only the dark that is still ahead', () => {
    query.result = payload([t5])
    // From 11:50 only ten minutes of darkness are left, and T5 is past its best.
    render(
      <CometsTonight
        coords={KITT_PEAK}
        dark={DARK}
        nautical={DARK}
        now={new Date('2026-11-07T11:50:00Z')}
      />,
    )
    const item = screen.queryByRole('listitem')
    expect(item?.textContent ?? '').toMatch(/^C\/2024 T5/)
    expect(item?.textContent).toContain(`best ${hhmm(new Date('2026-11-07T11:50:00Z'))}`)
  })

  it('marks an interstellar object', () => {
    query.result = payload([], [{ ...t5, id: 'sb:x', name: '3I/ATLAS', interstellar: true, m1: 5 }])
    render(<CometsTonight coords={KITT_PEAK} dark={DARK} nautical={DARK} now={NOW} />)
    expect(screen.getByRole('listitem').textContent).toMatch(/interstellar/i)
  })

  it('says the data is out of date, not that nothing is up, once the night outruns the slice (#135)', () => {
    // A copy left stale by a long refresh outage: its spans end before tonight's dark does.
    query.result = payload([t5], [], { fromJd: jd(NOW) - 8, toJd: jd(DARK.start) + 0.1 })
    render(<CometsTonight coords={KITT_PEAK} dark={DARK} nautical={DARK} now={NOW} />)
    expect(screen.queryByRole('listitem')).toBeNull()
    expect(document.body.textContent).toMatch(/comet data is out of date/i)
    expect(document.body.textContent).not.toMatch(/No comet bright enough/i)
  })

  it('names the list for both kinds of object', () => {
    query.result = payload([t5], [], WINDOW, [vesta])
    render(<CometsTonight coords={KITT_PEAK} dark={DARK} nautical={DARK} now={NOW} />)
    expect(screen.getByText('Comets and asteroids tonight')).toBeTruthy()
  })

  it('says when the comet data is unavailable', () => {
    query.result = { data: undefined, error: new Error('503') }
    render(<CometsTonight coords={KITT_PEAK} dark={DARK} nautical={DARK} now={NOW} />)
    expect(document.body.textContent).toMatch(/comet data is unavailable/i)
  })
})

describe('CometsTonight, sky view links (#99 item 5)', () => {
  it('links each row to its sky view by the orrery key, in real time', () => {
    query.result = payload([t5], [], WINDOW, [vesta])
    render(<CometsTonight coords={KITT_PEAK} dark={DARK} nautical={DARK} now={NOW} />)
    const hrefs = screen
      .getAllByRole('link', { name: /sky view of/i })
      .map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('#sky?target=sbc:20000004')
    expect(hrefs).toContain('#sky?target=sbc:1004035')
  })
})
