/**
 * How the chosen satellite's 3D model is turned and sized in the Earth frame (#194).
 * Pure functions on scene-space vectors and px; the renderer feeds them what it drew.
 */
import { Vector3 } from 'three'

import type { Attitude } from '@/lib/orrery/craftModels'
import type { ModelDescriptor } from '@/lib/orrery/modelDescriptor'

import { craftModelPx, PX_CEILING } from './pxClamp'

/** The model's radius is at most this share of Earth's drawn radius, so it never swallows Earth. */
const MODEL_EARTH_SHARE = 0.25
/**
 * The model's radius, px, while the Sun is not on screen (ADR 0030): 40 px across. The Sun rule
 * (nothing near Earth outgrows the Sun, #195) only has something to protect when the Sun can be
 * compared with it, so it holds where the Sun is in view and not elsewhere.
 */
export const SAT_MODEL_OFFSCREEN_PX = 20
/**
 * Once the Sun counts as on screen it keeps counting until its disc is this far (px) clear of
 * the view. Without the margin a Sun drifting along an edge, from the camera or from the time
 * playing, would flip the model between two sizes every frame.
 */
const SUN_HYSTERESIS_PX = 48
/** The ring stands this far outside a model, as a share of its radius. */
const RING_CLEARANCE = 1.25
/** The ring never reaches the Sun's drawn radius: this share of it is the most it takes. */
const RING_SUN_SHARE = 0.95

/**
 * The scene direction a model's axis should point along. 'earth' is nadir (the middle of
 * Earth as drawn), 'sun' the Sun, 'ecliptic-north' scene +Y. Only the axis is aimed: the
 * roll about it is free, so a model never claims an orientation the data does not have.
 * A satellite sitting on its target gets +Y, not a NaN.
 */
export function satFacing(attitude: Attitude, sat: Vector3, earth: Vector3, sun: Vector3): Vector3 {
  if (attitude === 'ecliptic-north') return new Vector3(0, 1, 0)
  const d = (attitude === 'sun' ? sun : earth).clone().sub(sat)
  return d.lengthSq() > 0 ? d.normalize() : new Vector3(0, 1, 0)
}

export interface SatModelSizeInput {
  /** Earth's drawn radius, px. */
  earthPx: number
  /** The marker's drawn radius, px: the least the model may be. */
  markerPx: number
  /** The Sun's drawn radius, px (NaN when unknown). */
  sunPx: number
  /** The Sun is on screen (`sunOnScreen`): the Sun rule holds. */
  sunVisible: boolean
}

/**
 * The chosen satellite's model radius, px (ADR 0030). A fixed, readable size and not a true
 * one; it does not follow the satellite's real size or height. With the Sun on screen it is the
 * focused craft's rule (`craftModelPx`, #204): 0.9 of the Sun's drawn radius, 9 px at its floor.
 * With the Sun off screen it is `SAT_MODEL_OFFSCREEN_PX`. Either way kept to a quarter of
 * Earth's drawn radius so it never swallows a far-off Earth, and never under the marker.
 */
export function satModelPx({ earthPx, markerPx, sunPx, sunVisible }: SatModelSizeInput): number {
  const size = sunVisible ? craftModelPx(sunPx) : SAT_MODEL_OFFSCREEN_PX
  return Math.max(markerPx, Math.min(size, earthPx * MODEL_EARTH_SHARE))
}

/**
 * The chosen satellite's selection ring radius, px. The usual ring (`PX_CEILING.satSelect`)
 * with no model; with one, 1.25 of its radius, and while the Sun is on screen held under it like
 * every marker near Earth (#195).
 */
export function satRingPx({
  modelPx,
  sunPx,
  sunVisible,
}: {
  modelPx: number | null
  sunPx: number
  sunVisible: boolean
}): number {
  if (modelPx === null) return PX_CEILING.satSelect
  const sunCap = sunVisible && !Number.isNaN(sunPx) ? sunPx * RING_SUN_SHARE : Infinity
  return Math.max(PX_CEILING.satSelect, Math.min(modelPx * RING_CLEARANCE, sunCap))
}

export interface SunOnScreenInput {
  /** The Sun's centre in normalised device coordinates (-1 to 1 across the view), and depth. */
  x: number
  y: number
  z: number
  /** The Sun's drawn radius, px. */
  sunPx: number
  width: number
  height: number
  /** It counted as on screen last frame. */
  wasOn: boolean
}

/**
 * Whether the Sun is on screen: in front of the camera and its disc reaching into the view.
 * Once on it stays on until the disc is `SUN_HYSTERESIS_PX` clear of the view.
 */
export function sunOnScreen({ x, y, z, sunPx, width, height, wasOn }: SunOnScreenInput): boolean {
  if (z > 1) return false
  const margin = (Number.isNaN(sunPx) ? 0 : sunPx) + (wasOn ? SUN_HYSTERESIS_PX : 0)
  const pastX = (Math.abs(x) - 1) * (width / 2)
  const pastY = (Math.abs(y) - 1) * (height / 2)
  return pastX <= margin && pastY <= margin
}

/**
 * The chosen satellite's scene model, looked up once. The lookup reads the satellite's
 * details and family, which is too much to do every frame; it changes only when the choice
 * moves or a new field of satellites arrives (the field is replaced, never edited).
 */
export class SceneModelCache {
  private key: string | null = null
  private field: object | null = null
  private model: ModelDescriptor | undefined
  private filled = false

  resolve(
    key: string | null,
    field: object | null,
    compute: () => ModelDescriptor | undefined,
  ): ModelDescriptor | undefined {
    if (this.filled && this.key === key && this.field === field) return this.model
    this.key = key
    this.field = field
    this.model = compute()
    this.filled = true
    return this.model
  }
}
