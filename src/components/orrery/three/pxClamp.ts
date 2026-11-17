/**
 * Pixel clamps for markers sized in scene units (#195). A share-of-Earth marker grows
 * with Earth, so without a ceiling a big window shows a Moon bigger than the Sun, which
 * shrinks to its px floor in the Earth frame.
 */

import { CRAFT_ICON_PX } from './craftLayer'

/**
 * A scene radius held between `minPx` and `maxPx` on screen, given the scene units that
 * cover one px. The ceiling wins if the floor sits above it. No `maxPx`: floor only.
 */
export function clampRadius(
  radius: number,
  unitsPerPx: number,
  minPx: number,
  maxPx?: number,
): number {
  const floored = Math.max(radius, minPx * unitsPerPx)
  return maxPx === undefined ? floored : Math.min(floored, maxPx * unitsPerPx)
}

/**
 * On-screen radius ceilings, px. All sit under the Sun's 10 px floor radius (the least it
 * ever draws), ordered by how important the marker is: the Moon is the biggest thing near
 * Earth, a debris ring only has to read. The ring's 9 px is its own floor.
 */
export const PX_CEILING = {
  moon: 8,
  l1: 7,
  asteroid: 6,
  satMarker: 6,
  /** The chosen satellite's ring (#140): one fixed size, outside its marker. */
  satSelect: 8,
  satReentry: 9,
  /** A comet or an interstellar object (#99): a point, never a disc. */
  smallBody: 5,
  /** A dwarf planet (#99 item 8): a little more than a comet, still far under the Sun. */
  dwarf: 6,
  /** Charon (#99): never bigger than a dwarf planet's marker can be. */
  dwarfMoon: 5,
} as const

/** Charon (#99) never draws smaller than this, px; its ceiling is `PX_CEILING.dwarfMoon`. */
export const DWARF_MOON_MIN_PX = 3

/** A comet or interstellar object (#99) never draws smaller than this, px; its ceiling is `PX_CEILING.smallBody`. */
export const SMALL_BODY_MIN_PX = 3

/** A dwarf planet (#99 item 8) never draws smaller than this, px; its ceiling is `PX_CEILING.dwarf`. */
export const DWARF_MIN_PX = 4

/**
 * The focused craft's model radius in the orrery, px (#260): the craft icon's, at any zoom,
 * like the Voyagers' icons in Heliosphere. #204 drew it at 0.9 of the Sun's drawn radius,
 * which near the Sun made it the Sun's twin; seeing a craft up close is the close-up's job.
 */
export const CRAFT_MODEL_PX = CRAFT_ICON_PX / 2

/** A satellite model with the Sun on screen: never bigger than this share of the Sun's radius. */
const MODEL_SUN_SHARE = 0.9
/** The most a satellite model draws at, px in radius, however big the Sun is. */
const SUN_SHARE_MAX_PX = 100

/**
 * A satellite model's radius with the Sun on screen, px (#204, ADR 0030): 0.9 of the Sun's
 * drawn radius, held between the craft icon's radius and 100 px. A Sun radius that is not a
 * number gives the floor. (The craft models used this rule until #260.)
 */
export function sunShareModelPx(sunPx: number): number {
  const floor = CRAFT_ICON_PX / 2
  if (Number.isNaN(sunPx)) return floor
  return Math.min(SUN_SHARE_MAX_PX, Math.max(floor, sunPx * MODEL_SUN_SHARE))
}
