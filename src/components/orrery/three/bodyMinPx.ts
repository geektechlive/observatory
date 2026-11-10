/**
 * The least a body draws on screen, px radius, by scale mode. Zoomed out they keep a
 * readable size, zoomed in they grow with the scene. Ordered like the real radii.
 */
import type { BodyName } from '@/lib/orrery/bodies'

export type MinPxMode = 'exaggerated' | 'log' | 'proportional'

const MIN_PX: Record<BodyName, number> = {
  Sun: 10,
  Mercury: 3.5,
  Venus: 4,
  Earth: 4.5,
  Mars: 4,
  Jupiter: 6.5,
  Saturn: 6,
  Uranus: 5,
  Neptune: 5,
}
/** Markers in the proportional mode, where true sizes are far below a pixel. */
const MIN_PX_PROPORTIONAL = 2.5

/**
 * The Sun's floor is the same in every mode (#196). A craft icon is an 18 px sprite, a
 * 9 px radius, in every mode, and the Sun must read as the largest thing on the stage.
 * Raising the Sun's floor is simpler than shrinking icons per mode, which would make
 * them unreadable; planets keep their mode floors, all well under it.
 */
export function bodyMinPx(name: BodyName, mode: MinPxMode): number {
  if (name === 'Sun') return MIN_PX.Sun
  if (mode === 'proportional') return MIN_PX_PROPORTIONAL
  return mode === 'log' ? MIN_PX[name] * 0.6 : MIN_PX[name]
}
