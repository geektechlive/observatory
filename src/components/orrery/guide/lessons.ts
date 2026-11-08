/**
 * The guide's lessons (#159). Each is a short explanation, something to try, and a link in
 * the #108 format (`t`, `focus`, `preset`) that "Show me" applies through the same path a
 * pasted link takes (useOrreryLink), so the scene shows the thing being explained.
 *
 * Which lessons carry a fixed `t` is decided by how long the data lasts (CLAUDE.md):
 * craft, planets and the heliopause are fine at any date; the moons (±15 days of fine data),
 * the Earth frame and L1 (Horizons' Earth, ±30 days), satellites (±3 days of their epoch)
 * and the asteroid payload (a rolling ±30 days) only exist near today, so those lessons
 * carry no `t` and "Show me" returns the clock to now first.
 *
 * Every fact has its source in `sources`; the checks live in tests/unit/orrery-guide-facts.test.ts.
 */
import { AU_KM, LD_KM } from '@/lib/orrery/units'

import { L1_KEY } from '../catalog'
import type { OrreryLink } from '../orreryLink'

/** What a lesson needs of a close approach (the orrery's OrreryApproach has more). */
export interface LessonApproach {
  /** `sb:<number or designation>`: the link's focus. */
  id: string
  des: string
  name: string
  pha: boolean
  /** Horizons placed it in 3D. Without that the link has nothing to focus. */
  placed: boolean
  closeApproach: { date: string; distAu: number }
}

export interface LessonContext {
  approaches: readonly LessonApproach[]
}

export interface Lesson {
  id: string
  title: string
  /** Two to four short paragraphs. */
  paragraphs: readonly string[]
  /** What to look at or do once the scene is showing. */
  tryIt: string
  /** The link "Show me" applies; null while the lesson's data has not arrived. */
  link: OrreryLink | null
  /** Why `link` is null. */
  unavailable?: string
  /** Where the facts come from. */
  sources: readonly string[]
}

/** The placed approach with the smallest nominal miss distance, or null. */
export function closestApproach(approaches: readonly LessonApproach[]): LessonApproach | null {
  let best: LessonApproach | null = null
  for (const a of approaches) {
    if (!a.placed) continue
    if (best === null || a.closeApproach.distAu < best.closeApproach.distAu) best = a
  }
  return best
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** "12 November 2026, 08:30 UTC". */
function utcWhen(ms: number): string {
  const d = new Date(ms)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${String(d.getUTCDate())} ${MONTHS[d.getUTCMonth()] ?? ''} ${String(d.getUTCFullYear())}, ${hh}:${mm} UTC`
}

const NONE: Omit<OrreryLink, 'focus' | 'preset'> = { t: null }

function asteroidLesson(ctx: LessonContext): Lesson {
  const pick = closestApproach(ctx.approaches)
  const base = {
    id: 'closest-asteroid',
    title: 'The closest asteroid pass this month',
    sources: [
      'JPL Close Approach Data (ssd-api.jpl.nasa.gov/cad.api): nominal miss distance and time, over the last and next 30 days',
      'Lunar distance 384,400 km (src/lib/orrery/units.ts)',
      'PHA label: NASA CNEOS (cneos.jpl.nasa.gov/about/neo_groups.html)',
    ],
  }
  if (pick === null) {
    return {
      ...base,
      paragraphs: [
        'Every month asteroids pass Earth far closer than any planet ever comes. This lesson picks the closest pass in the data the orrery holds and shows it.',
        'The close-approach data from JPL has not arrived yet.',
      ],
      tryIt: 'Open the Near Earth group in the controls once the data has loaded.',
      link: null,
      unavailable: 'Waiting for close-approach data from JPL.',
    }
  }
  const ms = Date.parse(pick.closeApproach.date)
  const km = pick.closeApproach.distAu * AU_KM
  const ld = km / LD_KM
  const ldText = ld >= 10 ? String(Math.round(ld)) : ld.toFixed(1)
  const hazard = pick.pha
    ? ' JPL lists it as a potentially hazardous asteroid, which describes its orbit and size, not a forecast of an impact.'
    : ''
  return {
    ...base,
    title: `The closest asteroid pass this month: ${pick.name.replace(/^\((.*)\)$/, '$1')}`,
    paragraphs: [
      `Among the objects the orrery places, ${pick.name} makes the closest pass within 30 days of today: about ${ldText} lunar distances (${(km / 1e6).toFixed(2)} million km) from Earth, at ${utcWhen(ms)}.${hazard}`,
      'Show me jumps the clock to that moment and frames Earth with the asteroid chosen. Amber marks an asteroid and red one on the hazardous list.',
    ],
    tryIt:
      'Read the inspector: the miss distance comes with a range of uncertainty, and the size is an estimate from the asteroid’s brightness unless JPL has measured it. Press play at 1 h/s to watch it move past.',
    link: { ...NONE, t: ms, focus: pick.id, preset: 'earth' },
  }
}

export function buildLessons(ctx: LessonContext): Lesson[] {
  return [
    {
      id: 'voyager-1',
      title: 'Voyager 1 leaves the Sun’s bubble',
      paragraphs: [
        'On 25 August 2012 Voyager 1 crossed the heliopause, the edge of the Sun’s bubble of solar wind. NASA and JPL put it about 121.6 au from the Sun. That put it in interstellar space, the region outside the Sun’s bubble.',
        'At that distance a radio signal takes about 17 hours to reach Earth, the shortest delay physics allows.',
      ],
      tryIt:
        'Find the faint dashed ring marked “approx.” and the Light time row in the inspector. Then play at 1 day/s to watch Voyager 1 carry on outward. On a narrow screen the ring’s label is hidden.',
      link: { t: Date.UTC(2012, 7, 25), focus: 'naif:-31', preset: 'heliosphere' },
      sources: [
        'NASA/JPL date the crossing to 25 Aug 2012 (2013-09-12 release); JPL Horizons gives 121.60 au for that day (CLAUDE.md, HELIOPAUSE_V1_AU). NASA: Voyager 1 “crossed into interstellar space in August 2012”, the region outside the heliopause (science.nasa.gov/mission/voyager/voyager-1, read 2026-11-07)',
        '121.6 au x 499.0 s per au = 60,680 s = 16.9 h (tests/unit/orrery-guide-facts.test.ts)',
      ],
    },
    {
      id: 'l1',
      title: 'L1, the parking spot between Earth and the Sun',
      paragraphs: [
        'L1 is a point about 1.5 million km from Earth toward the Sun, nearly four times as far as the Moon. A craft parked there keeps pace with Earth and always has the Sun in view.',
        'SOHO and DSCOVR watch the Sun and the solar wind from L1, which gives about an hour’s warning at typical wind speeds before it reaches Earth.',
      ],
      tryIt:
        'Select the L1 marker. If NOAA’s solar wind data is available the inspector shows the wind speed and how long it takes to reach Earth. Near Earth the view is not to scale: distances beyond the geostationary ring are squeezed so the Moon and L1 fit one picture.',
      link: { ...NONE, focus: L1_KEY, preset: 'earth' },
      sources: [
        'L1 at 1.5 million km: NASA (JWST at L2 is 1.5 million km from Earth, science.nasa.gov/mission/webb/orbit; L1 is the same distance on the Sun side)',
        'SOHO and DSCOVR at L1: the orrery’s craft list (src/lib/orrery/craft.ts)',
        '1.5 million km / 400 km/s = 1.04 h; 1.5 million km / 384,400 km = 3.9 (tests/unit/orrery-guide-facts.test.ts)',
        'Earth frame: CLAUDE.md, “The Earth frame (#92)”',
      ],
    },
    asteroidLesson(ctx),
    {
      id: 'mars-retrograde',
      title: 'Mars seems to run backwards',
      paragraphs: [
        'From Earth, Mars normally creeps eastward against the stars. In late 2024 it stopped on 7 December, drifted backwards for 79 days, about 19 degrees in all, and turned forward again on 24 February 2025.',
        'Nothing really reversed. Earth, on a faster inner orbit, overtook Mars on 16 January 2025, when Mars stood opposite the Sun in our sky.',
      ],
      tryIt:
        'Show me stops the clock on that day. Press play at 1 day/s and watch Earth swing past Mars on the inside track. The orrery looks down on the system from above, so the backward loop itself, which is what you would see in the night sky, is not drawn.',
      link: { t: Date.UTC(2025, 0, 16), focus: 'Mars', preset: 'inner' },
      sources: [
        'JPL Horizons observer table, geocentre, Mars: longitude peaks 2024-Dec-07 (126.17 deg) and bottoms out 2025-Feb-24 (107.02 deg); Sun-observer-target angle peaks 2025-Jan-16 (queried 2026-11-07)',
        'The orrery’s own planet maths finds the same dates within 3 days (src/lib/orrery/retrograde.ts, tested)',
        '7 Dec 2024 to 24 Feb 2025 is 79 days',
      ],
    },
    {
      id: 'geostationary',
      title: 'The geostationary ring',
      paragraphs: [
        'A satellite 35,786 km above the equator goes round once in the time Earth takes to turn, so it seems to hang over one spot. Weather satellites such as the GOES series, and many communications satellites, sit on this ring, 6.6 Earth radii from Earth’s centre.',
        'NASA Earth Observatory notes that this constant view of one area is what makes the orbit so valuable for weather monitoring.',
      ],
      tryIt:
        'Look for the band of points far out around Earth, and tap one to see its group, height and how old its orbit data is. Inside the ring distances are true to scale; outside it they are squeezed.',
      link: { ...NONE, focus: null, preset: 'orbit' },
      sources: [
        'Kepler’s third law with Earth’s GM and the sidereal day: 42,164 km from the centre, 35,786 km up (tests/unit/orrery-guide-facts.test.ts)',
        'Earth orbit view holds the ring: CLAUDE.md, “Satellites (#98)”',
        'NASA Earth Observatory, Catalog of Earth Satellite Orbits (earthobservatory.nasa.gov/features/OrbitsCatalog, read 2026-11-07): a geostationary orbit does not move relative to the ground, and suits weather monitoring',
      ],
    },
    {
      id: 'oumuamua',
      title: '‘Oumuamua, a visitor from another star',
      paragraphs: [
        '‘Oumuamua, found on 19 October 2017, was the first object seen passing through the solar system from another star. Its path is a hyperbola (eccentricity 1.20), so the Sun cannot hold it.',
        'It swung past the Sun on 9 September 2017, at 0.26 au, closer than Mercury ever gets, about six weeks before anyone saw it.',
      ],
      tryIt:
        'This object is not in the orrery’s own data, so Show me asks JPL for its path and takes a moment. Then play at 1 day/s to follow it in and out.',
      link: { ...NONE, t: Date.UTC(2017, 8, 9, 12, 0, 0), focus: 'lookup:50788063', preset: null },
      sources: [
        'JPL SBDB (ssd-api.jpl.nasa.gov/sbdb.api?sstr=1I, read 2026-11-07): e = 1.2011, q = 0.2559 au, perihelion JD 2458006.007 TDB = 2017-09-09 12:10 UTC, SPK-ID 50788063',
        'Discovered 2017-10-19 by Pan-STARRS1 (NASA, science.nasa.gov/solar-system/comets/oumuamua; src/lib/orrery/smallBodies.ts)',
        'Mercury’s closest approach to the Sun is about 0.31 au (a = 0.387 au, e = 0.2056)',
      ],
    },
    {
      id: 'jupiter-moons',
      title: 'Jupiter’s four big moons',
      paragraphs: [
        'Jupiter has four large moons, first seen by Galileo Galilei in 1610: Io, Europa, Ganymede and Callisto. Io goes round Jupiter in 1.77 days, Europa in 3.55, Ganymede in 7.16 and Callisto in 16.7.',
        'The orrery draws them on a stretched scale so they stay readable beside the planet, so their distances are not to scale.',
      ],
      tryIt:
        'Play at 1 h/s: Io goes round in under a minute. Choose a moon in the Find box to read its orbital period and distance.',
      link: { ...NONE, focus: 'Jupiter', preset: null },
      sources: [
        'Periods from JPL Horizons physical data, read 2026-11-07 (src/lib/orrery/moons.ts)',
        'Galileo, 1610: NASA Science, Jupiter moons (science.nasa.gov/jupiter/moons, read 2026-11-07)',
        'Stretched moon scale: CLAUDE.md, “Major moons (#107)”',
      ],
    },
  ]
}
