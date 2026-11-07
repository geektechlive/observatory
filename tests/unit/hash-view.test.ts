import { describe, expect, it } from 'vitest'

import { buildHash } from '@/hooks/useHashView'
import { LAYER_KEYS, type LayerKey } from '@/store/ui'

const someOn = Object.fromEntries(
  LAYER_KEYS.map((k) => [k, k === 'iss' || k === 'quakes']),
) as Record<LayerKey, boolean>

describe('buildHash (#109)', () => {
  it.each(['earth', 'orbit'] as const)('keeps the globe layers on %s', (view) => {
    expect(buildHash(view, someOn)).toBe(`#${view}?layers=iss,quakes`)
  })

  // The layers are the Earth globe's and map's; the other tabs never show them, so
  // they only cluttered a shared orrery, Sun or sky link.
  it.each(['orrery', 'sun', 'sky'] as const)('writes no layers on %s', (view) => {
    expect(buildHash(view, someOn)).toBe(`#${view}`)
  })
})
