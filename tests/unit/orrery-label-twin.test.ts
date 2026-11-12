/**
 * A looked-up object drawn by its close-approach twin (#216): the chosen key is the
 * lookup's, but the label shown is the approach's, so the page ranks the approach.
 */
import { describe, expect, it } from 'vitest'

import { asteroidLabelKeys, labelOrder, labelRankKey } from '@/components/orrery/labelLayout'

const TWIN = 'sb:2026 VQ11'
const LOOKUP = 'lookup:54670410'
const items = [
  { name: 'Sun', kind: 'body' },
  { name: 'Earth', kind: 'body' },
  ...Array.from({ length: 9 }, (_, i) => ({ name: `sb:2026 A${String(i)}`, kind: 'asteroid' })),
  { name: TWIN, kind: 'asteroid', chosen: true },
]
const approaches = items
  .filter((i) => i.kind === 'asteroid')
  .map((i, n) => ({ key: i.name, pha: i.name !== TWIN, distAu: i.name === TWIN ? 0.04 : n / 1000 }))

describe('labelRankKey (#216)', () => {
  it('is the approach drawn for the chosen lookup, else the chosen key', () => {
    expect(labelRankKey(items, LOOKUP)).toBe(TWIN)
    expect(
      labelRankKey(
        items.filter((i) => i.name !== TWIN),
        LOOKUP,
      ),
    ).toBe(LOOKUP)
    expect(labelRankKey([], null)).toBeNull()
  })

  it.each([390, 1440])('ranks the twin approach first and keeps its label at %i px', (width) => {
    const key = labelRankKey(items, LOOKUP)
    expect(labelOrder(items, key, null)[0]?.name).toBe(TWIN)
    // Below 600 px only six approaches keep labels, hazardous and closest first: the twin
    // is neither, and keeps its label because it is chosen.
    expect(asteroidLabelKeys(approaches, key, width).has(TWIN)).toBe(true)
  })
})
