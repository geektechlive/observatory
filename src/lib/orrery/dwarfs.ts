// The dwarf planets in the orrery (#99 item 8): which ones, how Horizons is asked for
// them, and the elements their orbit lines are drawn from. scripts/orrery-smallbodies.mjs
// uses this in the refresh job; the page uses the names, keys and elements.
//
// No imports and nothing but erasable syntax, so the .mjs job can import it under
// Node's type stripping (like craft.ts and smallBodies.ts).
//
// - The marker comes only from one coarse Horizons span per body, interpolated, never
//   extrapolated. JPL publishes no long-term elements for any dwarf planet, and two-body
//   motion drifts tens of degrees over the clock (Pluto 36-85 degrees by 3000 BC).
// - The line is the two-body orbit from the elements below: the orbit's shape holds far
//   better than the position along it (docs/reference/orrery-data.md, measured).

export interface DwarfElements {
  /** Osculating at this epoch, Julian date (TDB). */
  readonly epochJd: number
  readonly e: number
  /** Perihelion distance, au, and time, JD (TDB). */
  readonly q: number
  readonly tp: number
  /** Node, argument of perihelion and inclination, degrees (ecliptic J2000). */
  readonly om: number
  readonly w: number
  readonly i: number
}

export interface DwarfSpec {
  readonly name: string
  /** SBDB's SPK-ID: the scene, search and link key is `sbc:<SPK-ID>`, as for comets. */
  readonly spkid: string
  /** Horizons' COMMAND. Never `DES=`. */
  readonly command: string
  /** Horizons' "Target body name", asserted exactly on every answer. */
  readonly target: string
  /** Days between samples: each keeps Catmull-Rom within 0.01 au of Horizons' midpoints. */
  readonly stepDays: number
  /** The span asked for, ISO dates (UTC, extended years for BC). */
  readonly from: string
  readonly to: string
  /** SBDB osculating elements (`sbdb.api?sstr=<des>&full-prec=1`, fetched 2026-11-12). */
  readonly elements: DwarfElements
}

/**
 * Pluto is asked as its system barycentre, '9' (DE441), the only Horizons ephemeris for it
 * that covers the whole clock: it runs from 3000 BC to 3000 AD, so the window reaches six
 * years (more than a step) past both ends. Ceres, Eris, Makemake and Haumea have JPL
 * small-body ephemerides only from 1599-12-11 to 2501-01-01, so they are asked for
 * 1600-2500 and hidden outside it.
 */
export const DWARFS: readonly DwarfSpec[] = [
  {
    name: 'Pluto',
    spkid: '20134340',
    command: '9',
    target: 'Pluto Barycenter (9)',
    stepDays: 1826,
    from: '-003005-01-01',
    to: '+003006-12-31',
    // SBDB orbit 1 (134340 Pluto), epoch 2016-07-19 (JD 2457588.5).
    elements: {
      epochJd: 2457588.5,
      e: 0.2518378778576892,
      q: 29.61871297351516,
      tp: 2447812.094159956,
      om: 110.2923840543057,
      w: 113.7090015158565,
      i: 17.14771140999114,
    },
  },
  {
    name: 'Ceres',
    spkid: '20000001',
    command: '1;',
    target: '1 Ceres (A801 AA)',
    stepDays: 120,
    from: '1600-01-01',
    to: '2500-12-31',
    // SBDB orbit JPL 48, epoch 2026-06-09 (JD 2461200.5).
    elements: {
      epochJd: 2461200.5,
      e: 0.07969229514816586,
      q: 2.545159361382861,
      tp: 2461599.841466614,
      om: 80.24862682043221,
      w: 73.29421453021587,
      i: 10.58802780183462,
    },
  },
  {
    name: 'Eris',
    spkid: '20136199',
    command: '136199;',
    target: '136199 Eris (2003 UB313)',
    stepDays: 1826,
    from: '1600-01-01',
    to: '2500-12-31',
    // SBDB orbit JPL 103, epoch 2026-06-09 (JD 2461200.5).
    elements: {
      epochJd: 2461200.5,
      e: 0.4382385347971672,
      q: 38.16267353549761,
      tp: 2545407.716847013,
      om: 36.00477044417249,
      w: 150.7949235840312,
      i: 43.9258279471791,
    },
  },
  {
    name: 'Makemake',
    spkid: '20136472',
    command: '136472;',
    target: '136472 Makemake (2005 FY9)',
    stepDays: 1826,
    from: '1600-01-01',
    to: '2500-12-31',
    // SBDB orbit JPL 130, epoch 2026-06-09 (JD 2461200.5).
    elements: {
      epochJd: 2461200.5,
      e: 0.1588889953992523,
      q: 38.33021338173601,
      tp: 2408158.694098616,
      om: 79.2948338209406,
      w: 297.0922733397207,
      i: 29.02785603743067,
    },
  },
  {
    name: 'Haumea',
    spkid: '20136108',
    command: '136108;',
    target: '136108 Haumea (2003 EL61)',
    stepDays: 1826,
    from: '1600-01-01',
    to: '2500-12-31',
    // SBDB orbit JPL 132, epoch 2026-06-09 (JD 2461200.5).
    elements: {
      epochJd: 2461200.5,
      e: 0.1944430148898797,
      q: 34.68751758088936,
      tp: 2500416.599615283,
      om: 121.7860561329425,
      w: 240.6905472508661,
      i: 28.20847393040364,
    },
  },
]

const DAY_MS = 86_400_000
const JD_UNIX_EPOCH = 2440587.5

/** The span to ask Horizons for, Julian dates. */
export function dwarfWindowJd(spec: DwarfSpec): { startJd: number; stopJd: number } {
  const jd = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS + JD_UNIX_EPOCH
  return { startJd: jd(spec.from), stopJd: jd(spec.to) }
}

const loose = (s: string) => s.trim().toLowerCase()

/** The dwarf planet a link names (`focus=pluto`), ignoring case, or undefined. */
export function dwarfByName(name: string): DwarfSpec | undefined {
  const want = loose(name)
  return DWARFS.find((d) => loose(d.name) === want)
}

/**
 * A link focus that needs the dwarf-planet data (#99 item 8): one's key, `sbc:<SPK-ID>`,
 * or its name (`focus=pluto`, `-` or `_` for spaces).
 */
export function isDwarfFocus(focus: string): boolean {
  if (focus.startsWith('sbc:')) return dwarfBySpkid(focus.slice(4)) !== undefined
  return dwarfByName(focus.replace(/[-_]+/g, ' ')) !== undefined
}

/** The dwarf planet with this SPK-ID, or undefined. */
export function dwarfBySpkid(spkid: string): DwarfSpec | undefined {
  return DWARFS.find((d) => d.spkid === spkid)
}
