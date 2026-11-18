/**
 * The fly-in's target marker (#261 follow-up). At its true size a craft a few metres across
 * stays under a pixel until about a kilometre out, so it seemed to "wink into existence" at
 * the end of the flight (the owner, 2026-11-17). A camera ship marks what it is closing on:
 * a bracket at the craft and its range, from the first frame. The bracket grows round the
 * model and fades out as the model itself becomes plain to see; nothing about the model's
 * size or the scene changes. No imports.
 */

/** The bracket is gone by the time the model's radius is this many CSS px. */
export const TARGET_FADE_PX = 40
/** It starts fading at this radius. */
const FADE_FROM_PX = 12
/** The smallest bracket, CSS px across: a sub-pixel craft still gets a visible mark. */
const MIN_SIZE_PX = 22
/** The bracket stands this far out from the model: its side over the model's diameter. */
const MARGIN = 1.6

export function formatRange(km: number): string {
  if (km >= 1_000_000) return `${(km / 1_000_000).toFixed(2)} million km`
  if (km >= 100) return `${Math.round(km).toLocaleString('en-US')} km`
  if (km >= 1) return `${km.toFixed(1)} km`
  return `${String(Math.max(1, Math.round(km * 1000)))} m`
}

/** The bracket's side, CSS px, and opacity for a model drawn `radiusPx` in radius. */
export function targetLook(radiusPx: number): { sizePx: number; opacity: number } {
  const sizePx = Math.max(MIN_SIZE_PX, 2 * radiusPx * MARGIN)
  const t = (radiusPx - FADE_FROM_PX) / (TARGET_FADE_PX - FADE_FROM_PX)
  const opacity = t <= 0 ? 1 : t >= 1 ? 0 : 1 - t
  return { sizePx, opacity }
}
