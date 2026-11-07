/**
 * Orrery label collisions (#91): earlier labels win the default slot; a colliding label
 * stacks above or below; the voice line's subject is never hidden.
 */
import { describe, expect, it } from 'vitest'

import { labelOrder, layoutLabels } from '@/components/orrery/labelLayout'

describe('labelOrder (#91)', () => {
  const names = ['Sun', 'Mercury', 'Venus', 'Earth', 'Mars'].map((name) => ({ name }))

  it('puts the selected body, then the voice subject, then Sun and Earth first', () => {
    expect(labelOrder(names, 'Mars', 'Venus').map((n) => n.name)).toEqual([
      'Mars',
      'Venus',
      'Sun',
      'Earth',
      'Mercury',
    ])
  })

  it('without a selection the voice subject leads', () => {
    expect(labelOrder(names, null, 'Venus')[0]?.name).toBe('Venus')
  })

  it('puts boosted craft (DSN contact, farthest out) after the voice subject, before the rest (#93)', () => {
    const items = [
      { name: 'Sun' },
      { name: 'Jupiter' },
      { name: 'naif:-61' }, // Juno
      { name: 'naif:-31' }, // Voyager 1
      { name: 'Venus' },
    ]
    const order = labelOrder(items, null, 'Venus', new Set(['naif:-31'])).map((n) => n.name)
    expect(order.slice(0, 3)).toEqual(['Venus', 'naif:-31', 'Sun'])
    expect(order.indexOf('naif:-31')).toBeLessThan(order.indexOf('naif:-61'))
  })
})

describe('layoutLabels (#91)', () => {
  it('stacks a colliding label instead of hiding it', () => {
    const shown = layoutLabels([
      { key: 'Earth', text: 'Earth', x: 100, y: 100, visible: true },
      { key: 'Venus', text: 'Venus', x: 104, y: 104, visible: true },
    ])
    expect(shown.get('Earth')).toEqual({ dy: 0 })
    expect(shown.get('Venus')?.dy).not.toBe(0)
  })

  it('hides an ordinary label when every slot is taken, but never the voice subject', () => {
    const crowd = [0, -18, 18, -36, 36].map((dy, i) => ({
      key: `b${String(i)}`,
      text: 'Body',
      x: 100,
      y: 100 + dy,
      visible: true,
    }))
    const ordinary = layoutLabels([
      ...crowd,
      { key: 'Mercury', text: 'Mercury', x: 100, y: 100, visible: true },
    ])
    expect(ordinary.has('Mercury')).toBe(false)
    const subject = layoutLabels([
      ...crowd,
      { key: 'Venus', text: 'Venus', x: 100, y: 100, visible: true, mustShow: true },
    ])
    expect(subject.has('Venus')).toBe(true)
  })

  it('skips bodies that are off screen or behind the camera', () => {
    const shown = layoutLabels([{ key: 'Mars', text: 'Mars', x: 10, y: 10, visible: false }])
    expect(shown.size).toBe(0)
  })
})
