/**
 * Where a moon goes in the orrery's scene (#107). place3d compresses the solar system so
 * Jupiter's whole moon system (Callisto at 0.013 au) would sit inside the planet's drawn
 * dot, so moons get their own exaggerated local scale around the planet as drawn:
 *
 *   r′ = R · (GAP + SPREAD · log10(1 + d / REF_KM))
 *
 * where R is the planet's drawn radius in scene units and d the true distance. The
 * direction is kept, with place3d's axes (ecliptic z is scene y, ecliptic y is scene −z).
 * At GAP 1.6 every moon clears the planet; the log keeps Miranda (130,000 km) and
 * Iapetus (3.6 million km) both near their planets while keeping each system's order.
 * The scene is not to scale here, and the inspector must say so.
 */
import type { Vec3 } from './scale'
import { AU_KM } from './units'

/** Inner edge of the moon zone, in planet radii as drawn. */
export const MOON_GAP = 1.6
/** Planet radii per decade of distance beyond REF_KM. */
export const MOON_SPREAD = 1.2
/** Where the local log scale bends, km: below it, nearly linear. */
export const MOON_REF_KM = 100_000

/**
 * Charon (#99): a moon placed at true scale against its planet as drawn. Its vector is
 * scaled so the planet's true radius is the drawn one: linear, so the pair keeps its real
 * shape and ratios, magnified against the rest of the scene. Same axes as
 * moonScenePosition below.
 */
export function toScaleMoonPosition(
  parentScenePos: Vec3,
  relVecAu: Vec3,
  parentRadiusScene: number,
  parentRadiusKm: number,
): Vec3 {
  const s = (parentRadiusScene * AU_KM) / parentRadiusKm
  return {
    x: parentScenePos.x + relVecAu.x * s,
    y: parentScenePos.y + relVecAu.z * s,
    z: parentScenePos.z - relVecAu.y * s,
  }
}

/**
 * A moon's scene position from its planet's scene position, the moon's planet-centred
 * ecliptic J2000 vector (au), and the planet's drawn radius (scene units).
 */
export function moonScenePosition(
  parentScenePos: Vec3,
  relVecAu: Vec3,
  parentRadiusScene: number,
): Vec3 {
  const dAu = Math.hypot(relVecAu.x, relVecAu.y, relVecAu.z)
  if (dAu === 0) return parentScenePos
  const r =
    parentRadiusScene * (MOON_GAP + MOON_SPREAD * Math.log10(1 + (dAu * AU_KM) / MOON_REF_KM))
  const s = r / dAu
  return {
    x: parentScenePos.x + relVecAu.x * s,
    y: parentScenePos.y + relVecAu.z * s,
    z: parentScenePos.z - relVecAu.y * s,
  }
}
