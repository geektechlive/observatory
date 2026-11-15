/**
 * The orrery's live Sun (#105): GOES SUVI's 171 Å composite from NOAA SWPC. Both the
 * frame list and the images answer `access-control-allow-origin: *`, so the browser
 * loads them straight from NOAA (CSP img-src and connect-src), never through a Function.
 * SDO and Helioviewer send no CORS header and can't be WebGL textures.
 */

const ORIGIN = 'https://services.swpc.noaa.gov'
/** The animation's frame list, oldest first (about 40 kB). */
export const SUVI_LIST_URL = `${ORIGIN}/products/animations/suvi-primary-171.json`
export const SUVI_REFRESH_MS = 10 * 60 * 1000

/**
 * Where the disc sits in a 1280 px SUVI frame: centred, radius about 390 px (measured on
 * the frame of 2026-11-07). The square crop drops the caption along the bottom edge.
 */
export const SUVI_FRAME = { size: 1280, discRadius: 390, crop: 560 } as const

/** The corona fades out between these fractions of the crop's half-width (disc: 0.70). */
export const SUN_CORONA_FADE = { from: 0.8, to: 0.98 } as const

/** The Sun's sprite sits this many Sun radii toward the camera (just past the surface). */
export const SUN_SPRITE_LIFT = 1.05

/**
 * What the live Sun draws (#253): the radius its disc and corona reach, to the middle of
 * the corona's fade, in the units of `sphereRadius`, and the depth the sprite sits at
 * (lifted toward the camera, so close up it projects larger than the sphere would). The
 * Sun's label goes past this, not past the sphere, or it sits on the bright limb.
 */
export function sunDrawnReach(
  sphereRadius: number,
  depth: number,
): { radius: number; depth: number } {
  const halfWidth = (SUVI_FRAME.crop / SUVI_FRAME.discRadius) * sphereRadius
  const corona = (SUN_CORONA_FADE.from + SUN_CORONA_FADE.to) / 2
  return {
    radius: halfWidth * corona,
    // Never at or behind the camera, however close it is.
    depth: Math.max(depth - SUN_SPRITE_LIFT * sphereRadius, depth * 0.1),
  }
}

export interface SuviFrame {
  readonly url: string
  /** The composite's exposure window, UTC. */
  readonly start: Date
  readonly end: Date
  /** e.g. GOES-19. */
  readonly satellite: string
}

const NAME =
  /^\/images\/animations\/suvi\/primary\/171\/[\w.-]*_g(\d{2})_s(\d{8}T\d{6})Z_e(\d{8}T\d{6})Z[\w.-]*\.png$/

const parseStamp = (s: string) =>
  new Date(
    `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`,
  )

/** The newest frame in the list, or null when the list isn't the shape we know. */
export function latestSuviFrame(list: unknown): SuviFrame | null {
  if (!Array.isArray(list) || list.length === 0) return null
  const last: unknown = list[list.length - 1]
  const path = last && typeof last === 'object' && 'url' in last ? last.url : null
  if (typeof path !== 'string') return null
  const m = NAME.exec(path)
  if (!m?.[1] || !m[2] || !m[3]) return null
  const start = parseStamp(m[2])
  const end = parseStamp(m[3])
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return { url: `${ORIGIN}${path}`, start, end, satellite: `GOES-${m[1]}` }
}
