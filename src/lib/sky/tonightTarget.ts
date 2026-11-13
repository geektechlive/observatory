import type { CometsTonightData } from '@/schemas/cometsTonight'

import type { Sampled } from './topocentric'

/** What the sky view draws: one object of the Tonight slice. */
export interface SkyTarget {
  name: string
  kind: 'comet' | 'asteroid'
  body: Sampled
}

/**
 * The Tonight slice's object for a link key (`sbc:<SPK-ID>`, whose slice id is
 * `sb:<SPK-ID>`), or null when the slice does not hold it. The slice is the only data the
 * sky view reads, so this is also "can the sky view show it".
 */
export function findSkyTarget(data: CometsTonightData, key: string): SkyTarget | null {
  const id = `sb:${key.slice('sbc:'.length)}`
  const asteroid = data.asteroids.find((a) => a.id === id)
  if (asteroid) {
    return { name: asteroid.name, kind: 'asteroid', body: { fine: asteroid.fine, coarse: null } }
  }
  const comet = data.comets.find((c) => c.id === id)
  return comet
    ? { name: comet.name, kind: 'comet', body: { fine: comet.fine, coarse: comet.coarse } }
    : null
}
