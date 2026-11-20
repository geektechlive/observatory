/**
 * What surrounds a spacecraft in the fly-in (#261): every body's true position relative to the
 * craft at a date, in km, from the same sources the orrery draws with. The craft and the moons
 * come from their JPL Horizons samples, Earth from Horizons where the payload covers it, and
 * the other planets from JPL's approximate elements. A moon with no samples for the date is
 * named in `omitted`, never guessed (the samples cover about two weeks either side of the
 * refresh).
 */
import type { OrreryTrack } from '@/schemas/orreryBodies'

import type { BodyName } from './bodies'
import { earthState } from './craftState'
import { PLANETS } from './elements'
import { stateAt } from './ephemeris'
import { heliocentric } from './kepler'
import { MOONS } from './moons'
import { type MoonBody, moonRelative } from './moonState'
import type { Vec3 } from './scale'
import { BODY_RADIUS_KM, type Km3, MOON_RADIUS_KM, relativeKm } from './trueScale'

export interface TrueBody {
  readonly key: string
  readonly name: string
  readonly kind: 'sun' | 'planet' | 'moon'
  /** Its centre relative to the craft, km, ecliptic J2000 axes. */
  readonly relKm: Km3
  readonly radiusKm: number
}

export interface Surroundings {
  readonly jd: number
  /** The craft, heliocentric au, ecliptic J2000. */
  readonly craftAu: Vec3
  readonly bodies: readonly TrueBody[]
  /** Moons left out because no samples cover the date. */
  readonly omitted: readonly string[]
  /** The omitted moons whose planet is within OMIT_NEAR_AU of the craft: the ones to mention. */
  readonly omittedNear: readonly string[]
}

/** A missing moon is worth saying so when its planet is this close to the craft, au. */
const OMIT_NEAR_AU = 0.2

type CraftTrack = Pick<OrreryTrack, 'fine' | 'coarse'> & { dense?: OrreryTrack['dense'] }

const MOON_RADIUS_BY_NAME = new Map(MOONS.map((m) => [m.name, m.radiusKm]))
const EARTHS_MOON = 'naif:301'

/** A moon's radius, km: Earth's Moon's own, or the JPL radius on its MOONS entry. */
export function moonRadiusKm(body: MoonBody): number | undefined {
  return body.key === EARTHS_MOON ? MOON_RADIUS_KM : MOON_RADIUS_BY_NAME.get(body.name)
}

/**
 * The bodies around a craft at `jd`, or null when the craft's own samples don't cover it
 * (the orrery interpolates, never extrapolates).
 */
export function surroundingsAt(
  craftTrack: CraftTrack,
  earthTrack: OrreryTrack | null,
  moons: readonly MoonBody[],
  jd: number,
): Surroundings | null {
  const craft = stateAt(craftTrack, jd)
  if (!craft) return null
  const craftAu = craft.position
  const helio = new Map<BodyName, Vec3>([['Sun', { x: 0, y: 0, z: 0 }]])
  for (const planet of PLANETS) {
    if (planet === 'Earth') {
      helio.set(planet, earthState(earthTrack, jd).position)
    } else {
      const h = heliocentric(planet, jd)
      helio.set(planet, { x: h.x, y: h.y, z: h.z })
    }
  }
  const bodies: TrueBody[] = []
  for (const [name, at] of helio) {
    bodies.push({
      key: name,
      name,
      kind: name === 'Sun' ? 'sun' : 'planet',
      relKm: relativeKm(at, craftAu),
      radiusKm: BODY_RADIUS_KM[name],
    })
  }
  const omitted: string[] = []
  const omittedNear: string[] = []
  for (const body of moons) {
    const parent = helio.get(body.parent)
    const rel = moonRelative(body, jd)
    const radiusKm = moonRadiusKm(body)
    if (!parent || !rel || radiusKm === undefined) {
      omitted.push(body.name)
      const away = parent
        ? Math.hypot(parent.x - craftAu.x, parent.y - craftAu.y, parent.z - craftAu.z)
        : Infinity
      if (away <= OMIT_NEAR_AU) omittedNear.push(body.name)
      continue
    }
    const at = {
      x: parent.x + rel.position.x,
      y: parent.y + rel.position.y,
      z: parent.z + rel.position.z,
    }
    bodies.push({
      key: body.key,
      name: body.name,
      kind: 'moon',
      relKm: relativeKm(at, craftAu),
      radiusKm,
    })
  }
  return { jd, craftAu, bodies, omitted, omittedNear }
}
