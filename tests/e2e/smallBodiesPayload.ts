/**
 * A mocked /api/orrery-smallbodies (#99), built around today so its spans never expire:
 * one comet with ±30 days of daily samples (and its elements, for the orbit line), and
 * 3I/ATLAS with a fine span and a coarse whole-path span from two years ago to two years
 * ahead. Both move in straight lines near 2–3 au, which is all the drawing needs.
 */
import type { Page } from '@playwright/test'

const DAY_MS = 86_400_000
const JD_UNIX = 2440587.5
const jdNow = () => Math.floor(Date.now() / DAY_MS) + JD_UNIX
const isoDay = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10)

function fine(at: (t: number) => number[], v: number[]) {
  const start = jdNow() - 30
  const samples: number[] = []
  for (let i = 0; i <= 60; i += 1) samples.push(...at(i - 30), ...v)
  return { start, step: 1, samples }
}

function coarse(at: (t: number) => number[]) {
  const start = jdNow() - 730
  const samples: number[] = []
  for (let i = 0; i <= 292; i += 1) samples.push(...at(i * 5 - 730))
  return { start, step: 5, samples }
}

const cometAt = (t: number) => [1.6 + 0.004 * t, -1.4 + 0.006 * t, 0.3]
const atlasAt = (t: number) => [-2.4 + 0.02 * t, 1.1 - 0.01 * t, -0.2 + 0.001 * t]

const common = {
  m1: null,
  k1: null,
  h: null,
  elementsSource: 'horizons',
  availableFrom: null,
  availableTo: null,
}

/** The payload's ids (`sb:<SPK-ID>`). */
const COMET_PAYLOAD_ID = 'sb:1004119'
const ATLAS_PAYLOAD_ID = 'sb:1004083'
/** The scene and link keys the orrery gives them (`sbc:<SPK-ID>`, smallBodyView.ts). */
export const COMET_ID = 'sbc:1004119'
export const ATLAS_ID = 'sbc:1004083'

export const smallBodies = () => ({
  generatedAt: new Date().toISOString(),
  coarseFetchedAt: new Date().toISOString(),
  frame: 'ecliptic-J2000',
  center: 'Sun',
  timeScale: 'TDB',
  units: { position: 'au', velocity: 'au/day' },
  sourceType: 'ephemeris',
  provider: 'jpl-horizons',
  comets: [
    {
      ...common,
      id: COMET_PAYLOAD_ID,
      spkid: '1004119',
      des: 'C/2026 A2',
      name: 'C/2026 A2 (Bok)',
      kind: 'comet',
      interstellar: false,
      discovered: null,
      magnitude: 13.8,
      elements: { epochJd: jdNow(), e: 0.9976, q: 1.94, tp: jdNow() - 40, om: 120, w: 40, i: 12 },
      vInfKms: null,
      solution: {
        ref: 'JPL#34',
        date: isoDay(-2),
        observations: 1994,
        dataArc: { from: isoDay(-300), to: isoDay(-3) },
      },
      target: 'Bok (C/2026 A2)',
      fine: fine(cometAt, [0.004, 0.006, 0]),
      coarse: null,
    },
  ],
  interstellar: [
    {
      ...common,
      id: ATLAS_PAYLOAD_ID,
      spkid: '1004083',
      des: 'C/2025 N1',
      name: '3I/ATLAS',
      kind: 'comet',
      interstellar: true,
      discovered: '2025-07-01',
      magnitude: null,
      elements: { epochJd: jdNow(), e: 6.12, q: 1.35, tp: jdNow() - 380, om: 323, w: 129, i: 175 },
      vInfKms: 57.98,
      solution: {
        ref: 'JPL#55',
        date: isoDay(-20),
        observations: 117,
        dataArc: { from: isoDay(-400), to: isoDay(-25) },
      },
      target: 'ATLAS (C/2025 N1)',
      fine: fine(atlasAt, [0.02, -0.01, 0.001]),
      coarse: coarse(atlasAt),
    },
  ],
  missing: [],
})

/**
 * A mocked /api/comets-tonight (#135, #99 item 4), the Tonight panel's slice: the same comet
 * with a magnitude law, a week of its fine span kept, and one bright asteroid (Vesta) on
 * the same samples. Returns the request paths seen.
 */
export async function serveCometsTonight(page: Page): Promise<string[]> {
  const asked: string[] = []
  await page.route('**/api/comets-tonight', (route) => {
    asked.push(new URL(route.request().url()).pathname)
    const { generatedAt, frame, center, timeScale, provider, comets } = smallBodies()
    const span = fine(cometAt, [0.004, 0.006, 0])
    const week = { start: span.start + 29, step: 1, samples: span.samples.slice(29 * 6, 38 * 6) }
    return route.fulfill({
      json: {
        generatedAt,
        frame,
        center,
        timeScale,
        provider,
        window: { fromJd: week.start, toJd: week.start + 8 },
        comets: comets.map((c) => ({
          id: c.id,
          name: c.name,
          interstellar: c.interstellar,
          m1: 9,
          k1: 10,
          fine: week,
          coarse: null,
        })),
        asteroids: [
          {
            id: 'sb:20000004',
            spkid: '20000004',
            name: '4 Vesta',
            h: 3.25,
            g: 0.32,
            gAssumed: false,
            elements: {
              epochJd: 2458849.5,
              e: 0.0886,
              q: 2.1527,
              tp: 2458247.8,
              om: 103.8,
              w: 150.8,
              i: 7.14,
            },
            fine: week,
          },
        ],
      },
    })
  })
  return asked
}

export const OUMUAMUA_ID = 'sbc:50788063'
/** JD of 2017-01-01 00:00 UTC. */
const JD_2017 = 2457754.5

/**
 * 1I/ʻOumuamua with a coarse span over 2017–2019 only (a straight line through 0.3 au at
 * its perihelion, 2017-09-09), for the guide's lesson: no fine span near today.
 */
function oumuamua() {
  const samples: number[] = []
  for (let i = 0; i <= 219; i += 1) {
    const t = i * 5 - 251 // days from perihelion
    samples.push(0.3 + 0.012 * t, 0.1 - 0.004 * t, 0.002 * t)
  }
  return {
    ...common,
    id: 'sb:50788063',
    spkid: '50788063',
    des: 'A/2017 U1',
    name: '1I/ʻOumuamua',
    kind: 'asteroid',
    interstellar: true,
    discovered: '2017-10-19',
    magnitude: null,
    elements: {
      epochJd: 2458080.5,
      e: 1.2011,
      q: 0.2559,
      tp: 2458006,
      om: 24.6,
      w: 241.8,
      i: 122.7,
    },
    vInfKms: 26.41,
    solution: {
      ref: 'JPL#16',
      date: '2018-06-26',
      observations: 207,
      dataArc: { from: '2017-10-14', to: '2018-01-02' },
    },
    target: "1I/'Oumuamua (A/2017 U1)",
    fine: null,
    coarse: { start: JD_2017, step: 5, samples },
  }
}

/**
 * Serves the payload; returns the request paths seen, so a test can tell it was asked for.
 * `withOumuamua` adds 1I over 2017–2019, for the guide's lesson.
 */
export async function serveSmallBodies(
  page: Page,
  opts: { withOumuamua?: boolean } = {},
): Promise<string[]> {
  const asked: string[] = []
  await page.route('**/api/orrery-smallbodies', (route) => {
    asked.push(new URL(route.request().url()).pathname)
    const json = smallBodies()
    if (opts.withOumuamua) json.interstellar.push(oumuamua() as never)
    return route.fulfill({ json })
  })
  return asked
}
