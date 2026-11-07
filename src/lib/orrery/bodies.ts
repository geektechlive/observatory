/**
 * The orrery's bodies and what the inspector says about each (#91; spec Parts 8, 10,
 * 16). Planets come from JPL's approximate elements, so every state is labelled a
 * Kepler approximation with JPL's stated error as its confidence reason.
 */
import { NOMINAL_ERROR, type PlanetName, PLANETS } from './elements'
import { heliocentric } from './kepler'
import type { OrbitalState, SpaceObject } from './model'
import { rangeRateKmS } from './motion'
import { AU_KM, lightTimeSeconds } from './units'

export type BodyName = 'Sun' | PlanetName

export interface OrreryBody {
  readonly name: BodyName
  readonly object: SpaceObject
}

const NAIF: Record<BodyName, string> = {
  Sun: '10',
  Mercury: '199',
  Venus: '299',
  Earth: '399',
  Mars: '499',
  Jupiter: '599',
  Saturn: '699',
  Uranus: '799',
  Neptune: '899',
}

const PROVIDER = 'JPL approximate elements (Standish & Williams)'

export const ORRERY_BODIES: readonly OrreryBody[] = (['Sun', ...PLANETS] as BodyName[]).map(
  (name) => ({
    name,
    object: {
      id: `naif:${NAIF[name]}`,
      name,
      category: name === 'Sun' ? 'star' : 'planet',
      identifiers: { naifId: NAIF[name] },
      sourceProviders: name === 'Sun' ? [] : [PROVIDER],
    },
  }),
)

const OUTER = new Set<PlanetName>(['Jupiter', 'Saturn', 'Uranus', 'Neptune'])

export interface PlanetDescription {
  readonly state: OrbitalState
  readonly sunDistanceAu: number
  /** Null for Earth itself. */
  readonly earthDistanceAu: number | null
  readonly lightTimeFromEarthS: number | null
  /** Negative while approaching Earth. Null for Earth. */
  readonly rangeRateKmS: number | null
  readonly jd: number
}

const iso = (jd: number) => new Date((jd - 2440587.5) * 86_400_000).toISOString()

export function describePlanet(planet: PlanetName, jd: number): PlanetDescription {
  const pos = heliocentric(planet, jd)
  const [lonArcsec, distThousandKm] = NOMINAL_ERROR[pos.table][planet]
  const window = pos.table === 1 ? '1800–2050' : '3000 BC – 3000 AD'
  const reasons = [
    `JPL's stated error for ${planet} in Table ${String(pos.table)} (${window}): about ${String(lonArcsec)}″ in longitude and ${distThousandKm.toLocaleString('en-US')},000 km in distance.`,
    'Computed from mean orbital elements, not from observation.',
  ]
  if (OUTER.has(planet)) {
    reasons.push('Placed about the solar-system barycentre, up to 0.01 au from the Sun’s centre.')
  }
  if (pos.outOfRange) {
    reasons.unshift('This date is outside 3000 BC – 3000 AD, where no JPL table is valid.')
  }
  const earth = planet === 'Earth' ? null : heliocentric('Earth', jd)
  const earthDistanceAu = earth
    ? Math.hypot(pos.x - earth.x, pos.y - earth.y, pos.z - earth.z)
    : null

  return {
    jd,
    sunDistanceAu: Math.hypot(pos.x, pos.y, pos.z),
    earthDistanceAu,
    lightTimeFromEarthS:
      earthDistanceAu === null ? null : lightTimeSeconds(earthDistanceAu * AU_KM),
    rangeRateKmS:
      planet === 'Earth'
        ? null
        : rangeRateKmS(
            (t) => heliocentric(planet, t),
            (t) => heliocentric('Earth', t),
            jd,
          ),
    state: {
      timestampUTC: iso(jd),
      positionAu: { x: pos.x, y: pos.y, z: pos.z },
      referenceFrame: 'ecliptic J2000',
      referenceCenter: OUTER.has(planet) ? 'solar-system barycentre' : 'Sun',
      timeScale: 'TDB (UTC used; 69 s apart)',
      sourceType: 'kepler_approximation',
      sourceProvider: `${PROVIDER}, Table ${String(pos.table)}`,
      accuracyDescription: `${String(lonArcsec)}″ longitude, ${distThousandKm.toLocaleString('en-US')},000 km distance (JPL nominal)`,
      confidence: pos.outOfRange ? 'low' : pos.table === 1 ? 'high' : 'medium',
      confidenceReasons: reasons,
    },
  }
}
