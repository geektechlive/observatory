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
      'JPL Close Approach Data (ssd-api.jpl.nasa.gov/cad.api): miss distance and time of closest approach, for 30 days either side of today',
      'One lunar distance is 384,400 km',
      'NASA CNEOS, near-Earth object groups: how a potentially hazardous asteroid is defined (cneos.jpl.nasa.gov/about/neo_groups.html)',
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

/*
 * Where each lesson's facts were checked, for maintainers (the lists below name only public
 * sources, which is what a visitor sees):
 * - Heliopause 121.6 au on 2012-08-25: HELIOPAUSE_V1_AU (src/lib/orrery/units.ts) and
 *   CLAUDE.md "Heliopause". Light-time arithmetic: tests/unit/orrery-guide-facts.test.ts.
 * - L1, Earth frame, Moon < L1 < 0.05 au pass: CLAUDE.md "The Earth frame (#92)".
 * - Mars turning points: tests/unit/orrery-guide-facts.test.ts and src/lib/orrery/retrograde.ts.
 * - Geostationary ring, satellite switches: CLAUDE.md "Satellites (#98)"; radius in
 *   tests/unit/orrery-guide-facts.test.ts.
 * - 'Oumuamua SPK-ID 50788063 and discovery date: src/lib/orrery/smallBodies.ts.
 * - Moon periods: src/lib/orrery/moons.ts; stretched scale: CLAUDE.md "Major moons (#107)".
 */
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
        'NASA and JPL date Voyager 1’s crossing of the heliopause to 25 August 2012 (news release of 12 September 2013)',
        'JPL Horizons puts Voyager 1 at 121.60 au from the Sun on that day',
        'NASA Science, Voyager 1: it “crossed into interstellar space in August 2012”, the region outside the heliopause (science.nasa.gov/mission/voyager/voyager-1, read 7 November 2026)',
        'Signal delay: light takes about 499 seconds to cross one au, so 121.6 au is about 16.9 hours',
      ],
    },
    {
      id: 'l1',
      title: 'L1, the parking spot between Earth and the Sun',
      paragraphs: [
        'L1 is a point about 1.5 million km from Earth toward the Sun, nearly four times as far as the Moon. A craft parked there keeps pace with Earth and always has the Sun in view.',
        'SOHO and DSCOVR watch the Sun and the solar wind from L1. The most common, slow solar wind moves at about 400 km/s, so it takes roughly an hour to reach Earth from there, and that hour is the warning these craft give.',
      ],
      tryIt:
        'Select the L1 marker. If NOAA’s solar wind data is available the inspector shows the wind speed and how long it takes to reach Earth. Near Earth the view is not to scale: distances beyond the geostationary ring are squeezed so the Moon and L1 fit one picture.',
      link: { ...NONE, focus: L1_KEY, preset: 'earth' },
      sources: [
        'NASA Science, SOHO: it operates near the Sun–Earth L1 point, about 1.5 million km from Earth (science.nasa.gov/mission/soho, read 7 November 2026)',
        'NASA Science, DSCOVR: it hovers between the Sun and Earth at Lagrange point 1 (science.nasa.gov/mission/dscovr, read 7 November 2026)',
        'NOAA Space Weather Prediction Center: the most common solar wind is slow wind at about 400 km/s (swpc.noaa.gov/phenomena/solar-wind, read 7 November 2026)',
        'Arithmetic: 1.5 million km at 400 km/s takes about 1.04 hours, and is 3.9 times the Moon’s 384,400 km',
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
        'JPL Horizons observer table from Earth’s centre, Mars (queried 7 November 2026): its ecliptic longitude peaks on 7 December 2024 and bottoms out on 24 February 2025, and the Sun–Earth–Mars angle peaks on 16 January 2025',
        'The orrery’s own planet maths finds the same turning points within 3 days',
        'From 7 December 2024 to 24 February 2025 is 79 days',
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
        'Kepler’s third law with Earth’s gravitational parameter and the sidereal day: 42,164 km from Earth’s centre, 35,786 km above the equator',
        'NASA Earth Observatory, Catalog of Earth Satellite Orbits: a geostationary orbit does not move relative to the ground, which suits weather monitoring (earthobservatory.nasa.gov/features/OrbitsCatalog, read 7 November 2026)',
      ],
    },
    {
      id: 'oumuamua',
      title: '‘Oumuamua, a visitor from another star',
      paragraphs: [
        '‘Oumuamua, found on 19 October 2017, was the first known interstellar object to visit our solar system. Its path is a hyperbola (eccentricity 1.20), so the Sun cannot hold it.',
        'It swung past the Sun on 9 September 2017, at 0.26 au, closer than Mercury ever gets, about six weeks before anyone saw it.',
      ],
      tryIt:
        'This object is not in the orrery’s own data, so Show me asks JPL for its path and takes a moment. Then play at 1 day/s to follow it in and out.',
      link: { ...NONE, t: Date.UTC(2017, 8, 9, 12, 0, 0), focus: 'lookup:50788063', preset: null },
      sources: [
        'JPL Small-Body Database, 1I/ʻOumuamua (ssd-api.jpl.nasa.gov/sbdb.api?sstr=1I, read 7 November 2026): eccentricity 1.2011, perihelion distance 0.2559 au, perihelion at JD 2458006.007 TDB, which is 9 September 2017, 12:10 UTC',
        'NASA Science, ʻOumuamua: the first known interstellar object to visit our solar system, discovered by Pan-STARRS1 on 19 October 2017 (science.nasa.gov/solar-system/comets/oumuamua)',
        'Mercury’s perihelion distance is about 46 million km, 0.31 au (NASA planetary fact sheet)',
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
        'Orbital periods: JPL Horizons physical data for each moon, read 7 November 2026',
        'NASA Science, Jupiter’s moons: the four largest were first observed by Galileo Galilei in 1610 (science.nasa.gov/jupiter/moons, read 7 November 2026)',
      ],
    },
  ]
}
