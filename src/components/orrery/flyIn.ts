/**
 * The fly-in's settings for a spacecraft (#261), from the data the orrery page already has:
 * the craft's Horizons track, Earth's, the moons, ESA DISCOS's real dimensions and the clock.
 * Only a craft with a model and DISCOS dimensions gets one; anything else keeps the studio
 * "Look closer". The orrery flies in itself (#268, flyInDriver.ts) and sizes the model from
 * DISCOS's body and span once it has loaded (modelMetresPerUnit in trueScale.ts).
 */
import { craftModelFor } from '@/lib/orrery/craftModels'
import { jdFromDate } from '@/lib/orrery/kepler'
import type { MoonBody } from '@/lib/orrery/moonState'
import { surroundingsAt } from '@/lib/orrery/surroundings'
import type { CraftSize } from '@/lib/orrery/trueScale'
import type { OrreryTrack } from '@/schemas/orreryBodies'
import type { Discos } from '@/schemas/spaceTrack'
import { simTimeAt, useOrreryClock } from '@/store/orreryClock'

import type { FlyInOptions } from './three/flyInDriver'

export interface FlyInSource {
  /** The craft's catalog key, `naif:<id>`. */
  readonly key: string
  readonly tracks: readonly OrreryTrack[]
  readonly moons: readonly MoonBody[]
  readonly discos: Discos | null | undefined
  /** The orrery clock's Julian date now. */
  readonly jdNow: () => number
}

const NAIF = 'naif:'

/** The orrery clock's Julian date now (it may be playing at any rate). */
export function orreryJdNow(): number {
  return jdFromDate(new Date(simTimeAt(useOrreryClock.getState(), Date.now())))
}

/** The craft's real size from DISCOS: its body's largest dimension and its span; null with no body. */
function craftSize(d: Discos['craft'][string] | undefined): CraftSize | null {
  if (!d) return null
  const sizes = [d.widthM, d.heightM, d.depthM, d.diameterM].filter(
    (v): v is number => v !== null && v > 0,
  )
  return sizes.length > 0 ? { bodyM: Math.max(...sizes), spanM: d.spanM } : null
}

/** The fly-in settings for `key`, or undefined when it can't have one. */
export function flyInOptions(src: FlyInSource): FlyInOptions | undefined {
  if (!src.key.startsWith(NAIF)) return undefined
  const naifId = src.key.slice(NAIF.length)
  const track = src.tracks.find((t) => t.id === src.key)
  const model = craftModelFor(naifId)
  const size = craftSize(src.discos?.craft[naifId])
  if (!track || !model || !size) return undefined
  const earthTrack = src.tracks.find((t) => t.naifId === '399') ?? null
  // Outside the craft's data there is no place to put it, nor a Sun to light it by: studio.
  if (!surroundingsAt(track, earthTrack, src.moons, src.jdNow())) return undefined
  return {
    size,
    axis: model.axis,
    surroundings: () => surroundingsAt(track, earthTrack, src.moons, src.jdNow()),
  }
}
