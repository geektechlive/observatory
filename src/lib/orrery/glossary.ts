/**
 * The orrery's glossary (#159): one list of plain definitions, read by the guide drawer and
 * by the small "what's this?" buttons in the inspector (Term.tsx). Each entry names where
 * the fact comes from, so a definition can be checked, not just trusted.
 *
 * No imports and no markup, so both can load it lazily. Keep every `short` under 260
 * characters: it opens in a popover that must fit a phone.
 */
export const GLOSSARY_IDS = [
  'au',
  'ecliptic',
  'perihelion',
  'aphelion',
  'l1',
  'l2',
  'pha',
  'light-time',
  'range-rate',
  'epoch',
  'tle-omm',
  'heliopause',
  'opposition',
  'retrograde',
  'earth-radius',
  'geostationary',
  'ephemeris',
  'coarse',
  'dsn',
  'modelled',
] as const

export type GlossaryId = (typeof GLOSSARY_IDS)[number]

export interface GlossaryEntry {
  readonly id: GlossaryId
  /** As the orrery prints it. */
  readonly term: string
  /** One or two plain sentences: what the inspector shows beside the term. */
  readonly short: string
  /** More, for the guide only. */
  readonly more?: string
  /** Where the facts come from. */
  readonly source: string
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    id: 'au',
    term: 'Astronomical unit (au)',
    short:
      'The average distance from Earth to the Sun: about 149.6 million km. Distances across the solar system are easier to read in au than in kilometres.',
    more: 'The International Astronomical Union fixed it at exactly 149,597,870.7 km in 2012.',
    source: 'IAU 2012 Resolution B2',
  },
  {
    id: 'ecliptic',
    term: 'Ecliptic',
    short:
      'The flat plane of Earth’s orbit around the Sun. The planets orbit close to it, so “north” and “south” of the ecliptic tell you how far above or below the planets’ plane something is.',
    source: 'JPL Horizons uses the ecliptic of J2000 for every position the orrery draws',
  },
  {
    id: 'perihelion',
    term: 'Perihelion',
    short: 'The point in an orbit where an object is closest to the Sun.',
    source: 'Standard astronomy term',
  },
  {
    id: 'aphelion',
    term: 'Aphelion',
    short: 'The point in an orbit where an object is farthest from the Sun.',
    source: 'Standard astronomy term',
  },
  {
    id: 'l1',
    term: 'L1',
    short:
      'A point about 1.5 million km from Earth, toward the Sun, where the Sun’s and Earth’s gravity let a craft keep pace with Earth. Craft that watch the Sun and the solar wind sit there.',
    more: 'At a typical solar wind speed of 400 km/s, particles pass L1 about an hour before they reach Earth.',
    source:
      'NASA (L2 is 1.5 million km from Earth; L1 lies the same distance on the Sun side); the hour is 1.5 million km divided by 400 km/s',
  },
  {
    id: 'l2',
    term: 'L2',
    short:
      'The matching point on the far side of Earth from the Sun, also about 1.5 million km away. The James Webb Space Telescope orbits around this point rather than sitting on it, and keeps up with Earth as both circle the Sun.',
    source:
      'NASA Science, Webb orbit page (science.nasa.gov/mission/webb/orbit): “Webb orbits around L2; it does not sit stationary precisely at L2”, and it “keeps up with the Earth as it goes around the Sun”',
  },
  {
    id: 'pha',
    term: 'Potentially hazardous asteroid (PHA)',
    short:
      'An asteroid whose orbit can come within 0.05 au (about 7.5 million km) of Earth’s orbit and that is larger than roughly 140 m. The label describes an orbit and a size, not a forecast of an impact.',
    more: 'NASA’s rule is a minimum orbit intersection distance of 0.05 au or less and an absolute magnitude H of 22.0 or less.',
    source: 'NASA CNEOS, NEO groups (cneos.jpl.nasa.gov/about/neo_groups.html)',
  },
  {
    id: 'light-time',
    term: 'Light time',
    short:
      'How long light or a radio signal takes to cross a distance. No message can arrive sooner. One au is about 8 minutes 19 seconds.',
    source: 'One au divided by the speed of light (149,597,870.7 km / 299,792.458 km/s = 499.0 s)',
  },
  {
    id: 'range-rate',
    term: 'Range rate',
    short:
      'How fast the distance between Earth and the object is changing, in km/s. “Approaching” means the distance is shrinking, “receding” that it is growing. It is the speed along the line of sight only.',
    source: 'JPL Horizons observer table, the deldot column',
  },
  {
    id: 'epoch',
    term: 'Orbit data epoch',
    short:
      'The moment a satellite’s orbit description was fitted to measurements. The further the date is from the epoch, the more the real satellite drifts from the prediction. The orrery hides satellites more than 3 days from theirs.',
    source: 'CelesTrak orbit data; the 3-day window is the orrery’s own rule (#98)',
  },
  {
    id: 'tle-omm',
    term: 'TLE and OMM',
    short:
      'Two ways of writing a satellite’s orbit. A TLE (two-line element set) is the older text format, limited to five-digit catalogue numbers. An OMM (orbit mean-elements message) carries the same numbers with no such limit.',
    more: 'Since July 2026 satellites numbered 100000 and up cannot be written as TLEs, so the orrery reads OMM from CelesTrak.',
    source: 'CelesTrak GP data formats (celestrak.org/NORAD/documentation/gp-data-formats.php)',
  },
  {
    id: 'heliopause',
    term: 'Heliopause',
    short:
      'The edge of the Sun’s bubble of solar wind, where it meets the gas between the stars. NASA and JPL date Voyager 1’s crossing to 25 August 2012, about 121.6 au from the Sun. It is not a perfect sphere, and it moves with the Sun’s activity.',
    source: 'NASA/JPL, 2013-09-12 release; JPL Horizons distance for that day (121.60 au)',
  },
  {
    id: 'opposition',
    term: 'Opposition',
    short:
      'When a planet lies on the opposite side of the sky from the Sun. It rises at sunset and stays up all night. For a planet outside Earth’s orbit it is close to the nearest and brightest time of its cycle.',
    source: 'Standard astronomy term; Mars date from JPL Horizons',
  },
  {
    id: 'retrograde',
    term: 'Retrograde motion',
    short:
      'A planet that seems to drift backwards against the stars for a few weeks or months. Nothing reverses: Earth, on the faster inner track, overtakes the slower outer planet, like passing a car on a motorway.',
    source: 'JPL Horizons Mars table, Dec 2024 to Feb 2025 (the guide’s Mars lesson)',
  },
  {
    id: 'earth-radius',
    term: 'Earth radius (R⊕)',
    short:
      'A unit of length near Earth: 6,371 km, Earth’s average radius. The Moon is about 60 Earth radii away, and the geostationary ring is 6.6 from Earth’s centre.',
    source:
      'Mean Earth radius, 6,371 km, the value earthFrame.ts uses; the Moon figure is 384,400 km divided by it',
  },
  {
    id: 'geostationary',
    term: 'Geostationary orbit',
    short:
      'A circle above the equator, 35,786 km up, where a satellite takes exactly one turn of Earth’s spin per orbit and so hangs over one spot. Many weather and communications satellites live on this ring.',
    source:
      'Kepler’s third law with Earth’s GM and the sidereal day gives 42,164 km from Earth’s centre (checked in tests/unit/orrery-guide-facts.test.ts)',
  },
  {
    id: 'ephemeris',
    term: 'Ephemeris',
    short:
      'A table of where an object is at given times, computed from fitted orbits. The orrery interpolates between JPL’s samples and never extrapolates beyond them.',
    source: 'JPL Horizons',
  },
  {
    id: 'coarse',
    term: 'Coarse samples',
    short:
      'A whole mission sampled only every few days or weeks. The orrery draws a smooth curve between them: good for the picture, rough for exact numbers.',
    source: 'src/lib/orrery/ephemeris.ts (Catmull-Rom through the coarse span)',
  },
  {
    id: 'dsn',
    term: 'Deep Space Network',
    short:
      'NASA’s radio dishes at Goldstone (California), Madrid and Canberra, roughly a third of the way round the world from each other, so any craft is in view of one as Earth turns.',
    source:
      'NASA, What is the Deep Space Network (three facilities approximately 120 degrees apart in longitude)',
  },
  {
    id: 'modelled',
    term: 'Measured and modelled',
    short:
      'A measured value comes from an instrument. A modelled one is computed from orbital maths, like the planets, which come from JPL’s approximate elements. The inspector says which, and how far to trust it.',
    source: 'The orrery’s own accuracy notes (bodies.ts, craftState.ts)',
  },
]

const BY_ID = new Map<GlossaryId, GlossaryEntry>(GLOSSARY.map((e) => [e.id, e]))

export function glossaryEntry(id: GlossaryId): GlossaryEntry {
  const entry = BY_ID.get(id)
  if (!entry) throw new Error(`Unknown glossary term: ${id}`)
  return entry
}
