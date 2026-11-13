// Comets and interstellar objects for the orrery (#99): which ones, and how JPL is asked
// for them. scripts/orrery-smallbodies.mjs uses this in the refresh job; the page uses
// the catalogue.
//
// No imports and nothing but erasable syntax, so the .mjs job can import it under
// Node's type stripping (like craft.ts and closeApproach.ts). Positions come in as a
// function (`selectComets`' `positionAt`), so this file needn't import conic.ts.

/** How SBDB files an object, which decides how Horizons is asked for it. */
export type SmallBodyKind = 'comet' | 'asteroid'

export interface InterstellarSpec {
  /** The IAU's name for it. */
  readonly name: string
  /** JPL's designation, which Horizons' target name carries in brackets. */
  readonly des: string
  readonly spkid: string
  readonly kind: SmallBodyKind
  /**
   * Discovery date (UTC day), for the inspector. SBDB's `discovery` block is empty for
   * all three, so each is cited on its entry below (checked 2026-11-07, #129).
   */
  readonly discovered: string
  /**
   * The long span's largest step, days. 1I and 3I swing round the Sun inside 1.4 au and
   * need a fine step to keep that bend; 2I never came inside 2 au. Measured on the
   * 2026-11-07 dry run, the worst Catmull-Rom midpoint near perihelion is 0.0028 au for
   * 1I (q = 0.26 au), 800 km for 3I and 1,000 km for 2I.
   */
  readonly maxCoarseStepDays: number
}

/**
 * The three known visitors from outside the solar system. Designations and SPK-IDs from
 * SBDB (`sbdb.api?sstr=1I`, `2I`, `3I`, checked 2026-11-07); 1I is filed as an asteroid
 * ("Hyperbolic Asteroid", prefix A), the other two as comets.
 */
export const INTERSTELLAR: readonly InterstellarSpec[] = [
  {
    name: '1I/ʻOumuamua',
    des: 'A/2017 U1',
    spkid: '50788063',
    kind: 'asteroid',
    // NASA: "discovered Oct. 19, 2017 by the University of Hawaii's Pan-STARRS1
    // telescope" (science.nasa.gov/solar-system/comets/oumuamua). MPEC 2017-U181
    // (minorplanetcenter.net/mpec/K17/K17UI1.html) lists Pan-STARRS1 (F51) frames
    // from Oct. 18.47 onwards; the object was found in them on the 19th.
    discovered: '2017-10-19',
    maxCoarseStepDays: 5,
  },
  {
    name: '2I/Borisov',
    des: 'C/2019 Q4',
    spkid: '1003639',
    kind: 'comet',
    // MPEC 2019-R106 (minorplanetcenter.net/mpec/K19/K19RA6.html): "reported as a
    // comet candidate by G. Borisov (L51) on Aug. 30 UTC"; discovery frame 2019 08 30.04.
    discovered: '2019-08-30',
    maxCoarseStepDays: 10,
  },
  {
    name: '3I/ATLAS',
    des: 'C/2025 N1',
    spkid: '1004083',
    kind: 'comet',
    // MPEC 2025-N12 (minorplanetcenter.net/mpec/K25/K25N12.html): "discovered by ATLAS
    // Chile (W68) in four 30-second survey images taken on July 1 UT".
    discovered: '2025-07-01',
    maxCoarseStepDays: 5,
  },
]

/** At most this many comets: each costs one Horizons request per run. */
export const MAX_COMETS = 12
/**
 * Fainter than this forecast total magnitude, a comet is left out. A cut at 15 (a
 * backyard telescope by eye) left only two comets on 2026-11-07, a quiet month; at 18
 * the brightest dozen still qualified.
 */
export const FAINTEST_MAGNITUDE = 18

const SBDB_QUERY = 'https://ssd-api.jpl.nasa.gov/sbdb_query.api'
const SBDB_FIELDS = [
  'full_name',
  'pdes',
  'spkid',
  'prefix',
  'e',
  'q',
  'tp',
  'i',
  'om',
  'w',
  'M1',
  'K1',
]
/** Comets within this many days of perihelion are candidates. */
const PERIHELION_WINDOW_DAYS = 365
/** ...and with perihelion inside this distance, au. */
const MAX_PERIHELION_AU = 5

/**
 * Horizons' COMMAND for a small body, by SPK-ID (checked live, 2026-11-07). A comet
 * needs CAP;NOFRAG: its SPK-ID alone lists every apparition of a periodic comet
 * instead of answering. CAP searches comets only, so an asteroid (1I) is asked bare.
 */
export function smallBodyCommand(spkid: string, kind: SmallBodyKind): string {
  return kind === 'comet' ? `DES=${spkid};CAP;NOFRAG` : `DES=${spkid};`
}

const NUMBERED_PERIODIC = /^\d+[PDI]$/

/** JPL's designation from SBDB's prefix and pdes: "24P", "C/2025 N1", "P/2026 T1". */
export function cometDesignation(prefix: string, pdes: string): string {
  return NUMBERED_PERIODIC.test(pdes) ? pdes : `${prefix}/${pdes}`
}

/**
 * Whether Horizons' "Target body name" is the object asked for: "24P/Schaumasse" for a
 * numbered periodic comet, "ATLAS (C/2025 N1)" or "1I/'Oumuamua (A/2017 U1)" otherwise.
 */
export function targetMatchesSmallBody(des: string, target: string | null): boolean {
  if (!target) return false
  if (NUMBERED_PERIODIC.test(des)) return target.trim().startsWith(`${des}/`)
  return target.includes(`(${des})`)
}

/** SBDB Query: comets within a year of perihelion, perihelion inside 5 au, full precision. */
export function sbdbCometQueryUrl(nowJd: number): string {
  const params = new URLSearchParams({
    fields: SBDB_FIELDS.join(','),
    'sb-kind': 'c',
    'sb-cdata': JSON.stringify({
      AND: [
        `tp|RG|${String(nowJd - PERIHELION_WINDOW_DAYS)}|${String(nowJd + PERIHELION_WINDOW_DAYS)}`,
        `q|LT|${String(MAX_PERIHELION_AU)}`,
      ],
    }),
    'full-prec': 'true',
  })
  return `${SBDB_QUERY}?${params.toString()}`
}

export interface SbdbComet {
  /** SBDB's full name, trimmed: "24P/Schaumasse", "C/2025 R3 (PANSTARRS)". */
  name: string
  /** JPL's designation (`cometDesignation`), and SBDB's primary designation. */
  des: string
  pdes: string
  spkid: string
  /** Heliocentric ecliptic J2000 elements: e, q (au), tp (JD TDB), i, om, w (degrees). */
  e: number
  q: number
  tp: number
  i: number
  om: number
  w: number
  /** Total-magnitude law: T = M1 + 5 log Δ + K1 log r. */
  m1: number | null
  k1: number | null
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** SBDB Query's rows as comets. Throws if the fields are not the ones asked for. */
export function parseSbdbComets(json: unknown): SbdbComet[] {
  const body = json as { fields?: unknown; data?: unknown }
  if (JSON.stringify(body.fields) !== JSON.stringify(SBDB_FIELDS) || !Array.isArray(body.data)) {
    throw new Error(`SBDB Query answered fields ${JSON.stringify(body.fields)}`)
  }
  const comets: SbdbComet[] = []
  for (const row of body.data as unknown[][]) {
    const [fullName, pdes, spkid, prefix] = row
    const [e, q, tp, i, om, w] = row.slice(4, 10).map(num)
    if (typeof pdes !== 'string' || typeof prefix !== 'string') continue
    if (e == null || q == null || tp == null || i == null || om == null || w == null) continue
    comets.push({
      name: String(fullName).trim(),
      des: cometDesignation(prefix, pdes),
      pdes,
      spkid: String(spkid),
      e,
      q,
      tp,
      i,
      om,
      w,
      m1: num(row[10]),
      k1: num(row[11]),
    })
  }
  return comets
}

interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

// ---- Bright asteroids (#99 item 4) ----------------------------------------------------

/** At most this many asteroids are placed: each costs one Horizons request per run. */
export const MAX_ASTEROIDS = 14
/**
 * The job keeps asteroids forecast to V 11.5 or brighter on the refresh day: half a
 * magnitude of margin over the panel's V 11 cut (`FAINTEST_ASTEROID_LISTED`), since an
 * asteroid's brightness moves by a few tenths of a magnitude over the week the slice covers.
 */
export const FAINTEST_ASTEROID_MAGNITUDE = 11.5
/** G where SBDB has none (Astraea, Iris, Hygiea...): the IAU's default slope parameter. */
export const DEFAULT_SLOPE_G = 0.15

const ASTEROID_FIELDS = ['full_name', 'pdes', 'spkid', 'H', 'G', 'e', 'q', 'tp', 'i', 'om', 'w']
/** Absolute magnitude under 8 and a semi-major axis inside Jupiter's orbit: the bright main belt. */
const BRIGHTEST_H = 8
const MAX_SEMIMAJOR_AU = 5.5

/** SBDB Query: asteroids of absolute magnitude H < 8 with a < 5.5 au, full precision. */
export function sbdbAsteroidQueryUrl(): string {
  const params = new URLSearchParams({
    fields: ASTEROID_FIELDS.join(','),
    'sb-kind': 'a',
    'sb-cdata': JSON.stringify({
      AND: [`H|LT|${String(BRIGHTEST_H)}`, `a|LT|${String(MAX_SEMIMAJOR_AU)}`],
    }),
    'full-prec': 'true',
  })
  return `${SBDB_QUERY}?${params.toString()}`
}

export interface SbdbAsteroid {
  /** "4 Vesta": SBDB's full name without the provisional designation. */
  name: string
  /** JPL's designation (the asteroid's number, "4") and SPK-ID (20000004). */
  des: string
  spkid: string
  /** Absolute magnitude and slope parameter of the H,G system; G null where JPL has none. */
  h: number
  g: number | null
  /** Heliocentric ecliptic J2000 elements: e, q (au), tp (JD TDB), i, om, w (degrees). */
  e: number
  q: number
  tp: number
  i: number
  om: number
  w: number
}

/** SBDB Query's rows as asteroids. Throws if the fields are not the ones asked for. */
export function parseSbdbAsteroids(json: unknown): SbdbAsteroid[] {
  const body = json as { fields?: unknown; data?: unknown }
  if (
    JSON.stringify(body.fields) !== JSON.stringify(ASTEROID_FIELDS) ||
    !Array.isArray(body.data)
  ) {
    throw new Error(`SBDB Query answered fields ${JSON.stringify(body.fields)}`)
  }
  const out: SbdbAsteroid[] = []
  for (const row of body.data as unknown[][]) {
    const [fullName, pdes, spkid] = row
    const [h, g, e, q, tp, i, om, w] = row.slice(3, 11).map(num)
    if (typeof pdes !== 'string' || h == null) continue
    if (e == null || q == null || tp == null || i == null || om == null || w == null) continue
    out.push({
      name: String(fullName)
        .replace(/\s*\([^)]*\)\s*$/, '')
        .trim(),
      des: pdes,
      spkid: String(spkid),
      h,
      g: g ?? null,
      e,
      q,
      tp,
      i,
      om,
      w,
    })
  }
  return out
}

/**
 * Whether Horizons' "Target body name" is the asteroid asked for: "4 Vesta (A807 FA)" for a
 * numbered one (its number first), "(2024 YR4)" for one with only a designation.
 */
export function targetMatchesAsteroid(des: string, target: string | null): boolean {
  if (!target) return false
  return /^\d+$/.test(des) ? target.trim().startsWith(`${des} `) : target.includes(`(${des})`)
}

/** The Sun-target-observer angle, degrees, from the three sides of the triangle (au). */
export function phaseAngleDeg(r: number, delta: number, earthSun: number): number {
  const c = (r * r + delta * delta - earthSun * earthSun) / (2 * r * delta)
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI
}

/**
 * The IAU H,G system (adopted 1985; Bowell et al. 1989, "Application of photometric models
 * to asteroids"): V = H + 5 log10(r Δ) - 2.5 log10[(1 - G) Φ1 + G Φ2], with
 * Φi = exp(-Ai tan(α/2)^Bi), A1 = 3.33, B1 = 0.63, A2 = 1.87, B2 = 1.22. r and Δ in au,
 * α (the phase angle) in degrees. Checked against Horizons' APmag for Vesta in
 * tests/unit/orrery-bright-asteroids.test.ts. An estimate: real asteroids stray from the law.
 */
export function asteroidMagnitude(
  h: number,
  g: number,
  r: number,
  delta: number,
  phaseDeg: number,
): number {
  const t = Math.tan((phaseDeg * Math.PI) / 360)
  const phi1 = Math.exp(-3.33 * t ** 0.63)
  const phi2 = Math.exp(-1.87 * t ** 1.22)
  return h + 5 * Math.log10(r * delta) - 2.5 * Math.log10((1 - g) * phi1 + g * phi2)
}

export interface ChosenAsteroid extends SbdbAsteroid {
  /** JPL's H,G forecast V for the refresh's date: an estimate, not a measurement. */
  magnitude: number
}

export interface SelectAsteroidOptions {
  /** Heliocentric position from elements at a JD (conic.ts's `conicPosition`). */
  positionAt: (el: SbdbAsteroid, jd: number) => Vec3
  /** Earth's heliocentric position at a JD. */
  earthAt: (jd: number) => Vec3
  limit?: number
  faintest?: number
}

/** The asteroids the H,G law makes brightest on a date, brightest first, at most `limit`. */
export function selectAsteroids(
  asteroids: readonly SbdbAsteroid[],
  jd: number,
  opts: SelectAsteroidOptions,
): ChosenAsteroid[] {
  const earth = opts.earthAt(jd)
  const earthSun = Math.hypot(earth.x, earth.y, earth.z)
  const ranked: ChosenAsteroid[] = []
  for (const a of asteroids) {
    const p = opts.positionAt(a, jd)
    const r = Math.hypot(p.x, p.y, p.z)
    const delta = Math.hypot(p.x - earth.x, p.y - earth.y, p.z - earth.z)
    const alpha = phaseAngleDeg(r, delta, earthSun)
    const magnitude = asteroidMagnitude(a.h, a.g ?? DEFAULT_SLOPE_G, r, delta, alpha)
    if (magnitude <= (opts.faintest ?? FAINTEST_ASTEROID_MAGNITUDE))
      ranked.push({ ...a, magnitude })
  }
  ranked.sort((a, b) => a.magnitude - b.magnitude)
  return ranked.slice(0, opts.limit ?? MAX_ASTEROIDS)
}

export interface SelectOptions {
  /** Heliocentric position from elements at a JD (conic.ts's `conicPosition`). */
  positionAt: (el: SbdbComet, jd: number) => Vec3
  /** Earth's heliocentric position at a JD. */
  earthAt: (jd: number) => Vec3
  limit?: number
  faintest?: number
}

export interface ChosenComet extends SbdbComet {
  /** JPL's total magnitude for tonight, from M1 and K1: a forecast, not a measurement. */
  magnitude: number
}

/**
 * The comets worth drawing: those JPL's own magnitude law makes brightest tonight,
 * T = M1 + 5 log10 Δ + K1 log10 r. Leaves out split comets' fragments (they sit on
 * their parent at any scale we draw), the interstellar objects (fetched apart) and
 * anything with no magnitude law.
 */
export function selectComets(
  comets: readonly SbdbComet[],
  jd: number,
  opts: SelectOptions,
): ChosenComet[] {
  const interstellar = new Set(INTERSTELLAR.map((o) => o.spkid))
  const earth = opts.earthAt(jd)
  const ranked: ChosenComet[] = []
  for (const c of comets) {
    if (c.pdes.includes('-') || interstellar.has(c.spkid)) continue
    if (c.m1 === null || c.k1 === null) continue
    const p = opts.positionAt(c, jd)
    const r = Math.hypot(p.x, p.y, p.z)
    const delta = Math.hypot(p.x - earth.x, p.y - earth.y, p.z - earth.z)
    const magnitude = c.m1 + 5 * Math.log10(delta) + c.k1 * Math.log10(r)
    if (magnitude <= (opts.faintest ?? FAINTEST_MAGNITUDE)) ranked.push({ ...c, magnitude })
  }
  ranked.sort((a, b) => a.magnitude - b.magnitude)
  return ranked.slice(0, opts.limit ?? MAX_COMETS)
}
