/**
 * The Earth frame (#92). place3d compresses the solar system so much that the Moon, the
 * L1/L2 craft and this fortnight's close approaches (all within 0.05 au) would sit on
 * Earth's drawn dot. Around Earth they get their own scale, in Earth radii as drawn:
 *
 *   r′ = d / R⊕                              out to GEO (true scale, for satellites, #98)
 *   r′ = GEO + SPREAD · log10(d / GEO)       beyond, in Earth radii
 *
 * so the Moon (60 R⊕) lands near 10.5, L1 and L2 (235 R⊕) near 12.8, and a 0.05 au pass
 * near 15.6. The direction is kept, with place3d's axes. Not to scale beyond GEO; the
 * inspector says so.
 *
 * The frame is an inset: once open, Earth itself is drawn at the frame's unit
 * (EARTH_FRAME_UNIT scene units per Earth radius), far smaller than its exaggerated
 * solar-system size, so the whole neighbourhood (about 17 units out to 0.1 au) stays
 * inside half the scene distance to Venus at its closest. Drawn at Earth's exaggerated
 * size, a 0.05 au pass landed farther out than Venus. Zoomed out, or looking at anything
 * else, the frame closes and everything blends back to its true place in log space
 * (`earthFrameBlend`), so nothing jumps.
 */
import type { Vec3 } from './scale'
import { AU_KM } from './units'

/** IUGG mean Earth radius, km. */
export const EARTH_RADIUS_KM = 6_371
/** Geostationary orbit, 42,164 km from Earth's centre, in Earth radii. */
export const GEO_RADII = 42_164 / EARTH_RADIUS_KM
/** Earth radii as drawn per decade of distance beyond GEO. */
export const EARTH_FRAME_SPREAD = 4
/**
 * Scene units per Earth radius once the frame is open. 17 of them (0.1 au) make 0.145
 * units; Venus at its closest is about 0.31 units from Earth under place3d.
 */
export const EARTH_FRAME_UNIT = 0.0085
/**
 * The camera's distance from Earth, in frame units, where the frame starts to open and
 * where it is fully open. Their ratio matches Earth's exaggerated radius (0.048) over the
 * unit, and the blend runs in log space, so Earth keeps its size on screen while it
 * opens. The Inner preset sits near 965 (closed); the Earth–Moon preset within 110 even
 * on a portrait phone (orrery-earth-preset.test.ts).
 */
export const EARTH_FRAME_OPEN_CAMERA = { closed: 620, open: 110 } as const
/**
 * The camera's target must be this close to Earth, in frame units, for the frame to open
 * (closed beyond `closed`): focusing Mars or Venus never opens it, though the camera may
 * pass near Earth. Venus at its closest is about 36 units away.
 */
export const EARTH_FRAME_OPEN_TARGET = { closed: 30, open: 18 } as const
/** Distance from Earth to the Sun–Earth L1 and L2 points, km (≈ 1.5 million). */
export const L1_DISTANCE_KM = 1_500_000

/** A distance from Earth's centre, km, as a distance in Earth radii as drawn. */
export function earthFrameRadii(km: number): number {
  const x = km / EARTH_RADIUS_KM
  if (x <= GEO_RADII) return x
  return GEO_RADII + EARTH_FRAME_SPREAD * Math.log10(x / GEO_RADII)
}

/** Scene direction of an ecliptic vector (place3d's axes), unit length, and its length. */
function sceneDirection(rel: Vec3): { dir: Vec3; au: number } {
  const au = Math.hypot(rel.x, rel.y, rel.z)
  if (au === 0) return { dir: { x: 0, y: 0, z: 0 }, au }
  return { dir: { x: rel.x / au, y: rel.z / au, z: -rel.y / au }, au }
}

/**
 * A position around Earth in the open frame: Earth's scene position, the object's
 * geocentric ecliptic J2000 vector (au), and Earth's drawn radius (scene units). Linear
 * in the radius, so a loop drawn at radius 1 can be scaled (moonLayer's pattern).
 */
export function earthFramePosition(earthScene: Vec3, relAu: Vec3, earthRadiusScene: number): Vec3 {
  const { dir, au } = sceneDirection(relAu)
  const r = earthRadiusScene * earthFrameRadii(au * AU_KM)
  return { x: earthScene.x + dir.x * r, y: earthScene.y + dir.y * r, z: earthScene.z + dir.z * r }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * How open the frame is, 0 to 1, from the camera's and its target's distances to Earth
 * in frame units: log-linear in the camera's distance, linear in the target's.
 */
export function earthFrameBlend(cameraUnits: number, targetUnits = 0): number {
  const cam = EARTH_FRAME_OPEN_CAMERA
  const byCamera =
    cameraUnits <= 0
      ? 1
      : clamp01(Math.log(cam.closed / cameraUnits) / Math.log(cam.closed / cam.open))
  const tgt = EARTH_FRAME_OPEN_TARGET
  const byTarget = clamp01((tgt.closed - targetUnits) / (tgt.closed - tgt.open))
  return byCamera * byTarget
}

/** Earth's drawn radius as the frame opens: its own size to the frame's unit, in log space. */
export function earthFrameRadius(closedRadius: number, t: number): number {
  if (t <= 0) return closedRadius
  if (t >= 1) return EARTH_FRAME_UNIT
  return Math.exp(Math.log(closedRadius) * (1 - t) + Math.log(EARTH_FRAME_UNIT) * t)
}

/**
 * Scene offset from Earth: along the object's true direction, at a distance blended in
 * log space from `trueOffset` (where place3d puts it, scene units) at t = 0 to the open
 * frame's at t = 1.
 */
export function earthFrameOffset(
  relAu: Vec3,
  earthRadiusScene: number,
  trueOffset: number,
  t: number,
): Vec3 {
  const { dir, au } = sceneDirection(relAu)
  const open = earthRadiusScene * earthFrameRadii(au * AU_KM)
  const r =
    t <= 0 || trueOffset <= 0
      ? trueOffset
      : t >= 1
        ? open
        : Math.exp(Math.log(trueOffset) * (1 - t) + Math.log(open) * t)
  return { x: dir.x * r, y: dir.y * r, z: dir.z * r }
}

/**
 * The camera's near plane, scene units. A smaller one costs depth precision across the
 * 200,000-unit far plane, so the minimum distance near Earth is raised instead (#197).
 */
export const CAMERA_NEAR = 0.01
/** The camera never comes nearer its target than this, scene units, away from Earth. */
const CAMERA_MIN_DISTANCE = 0.5
/**
 * Near Earth, nearer: this many of the frame's Earth radii. Earth's near surface is then
 * (this - 1) radii off, which must exceed CAMERA_NEAR with margin or Earth is clipped
 * (#197): 2 gave 0.0085 against a 0.01 near plane; 2.5 gives 0.01275.
 */
const CAMERA_MIN_EARTH_RADII = 2.5

/**
 * How near the camera may come to its target (OrbitControls' minDistance), from the
 * target's distance to Earth, scene units. Near Earth the frame is true scale and the
 * Earth orbit view stands about 31 Earth radii (0.26 units) off (#98), inside the
 * general limit, which once held it at 59 and turned the satellites into a haze.
 */
export function cameraMinDistance(targetToEarth: number): number {
  return targetToEarth <= EARTH_FRAME_OPEN_TARGET.closed * EARTH_FRAME_UNIT
    ? CAMERA_MIN_EARTH_RADII * EARTH_FRAME_UNIT
    : CAMERA_MIN_DISTANCE
}

/** Minutes the solar wind takes from L1 to Earth at a speed, km/s; null without one. */
export function l1TransitMinutes(speedKmS: number): number | null {
  if (!(speedKmS > 0)) return null
  return L1_DISTANCE_KM / speedKmS / 60
}
