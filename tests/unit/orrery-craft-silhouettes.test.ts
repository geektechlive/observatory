import { describe, expect, it } from 'vitest'

import {
  SILHOUETTE_PATHS,
  SILHOUETTE_VIEWBOX,
  silhouetteTexture,
} from '@/components/orrery/three/craftSilhouettes'
import { CRAFT_MODELS } from '@/lib/orrery/craftModels'

/** Every number in a path made only of absolute commands. */
function coordinates(d: string): number[] {
  return [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
}

describe('craft silhouettes (#115)', () => {
  it('draws a silhouette for every craft in the model table', () => {
    for (const model of Object.values(CRAFT_MODELS)) {
      expect(SILHOUETTE_PATHS[model.silhouette], model.silhouette).toMatch(/^M/)
    }
  })

  it('uses absolute commands only and stays inside the view box', () => {
    for (const [key, d] of Object.entries(SILHOUETTE_PATHS)) {
      // Arcs carry flags and radii, so only the plain move/line/rect commands are checked.
      expect(d, key).not.toMatch(/[mlhvzacsqt]/)
      for (const n of coordinates(d.replace(/A[^A-Z]*/g, ''))) {
        expect(n, key).toBeGreaterThanOrEqual(0)
        expect(n, key).toBeLessThanOrEqual(SILHOUETTE_VIEWBOX)
      }
    }
  })

  it('is our own drawing, never an agency logo', () => {
    // Each key names a craft shape; there is no insignia key to draw.
    for (const key of Object.keys(SILHOUETTE_PATHS)) {
      expect(key).not.toMatch(/logo|insignia|meatball|emblem/i)
    }
  })

  it('returns no texture where the canvas has no 2D context (jsdom, a lost context)', () => {
    const doc = { createElement: () => ({ getContext: () => null, width: 0, height: 0 }) }
    expect(silhouetteTexture('voyager', doc as unknown as Document)).toBeNull()
  })
})
