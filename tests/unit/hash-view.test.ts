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

describe('buildHash keeps the orrery deep link (#108)', () => {
  const link = '#orrery?t=2012-08-25T00:00:00Z&focus=naif:-31&preset=earth'

  it('keeps an orrery link as it is, encoding untouched', () => {
    expect(buildHash('orrery', someOn, link)).toBe(link)
  })

  it('drops anything but the orrery params, layers included (#109)', () => {
    expect(buildHash('orrery', someOn, '#orrery?layers=iss&focus=Mars&junk=1')).toBe(
      '#orrery?focus=Mars',
    )
  })

  it('writes a bare #orrery when arriving from another tab', () => {
    expect(buildHash('orrery', someOn, '#earth?layers=iss&focus=Mars')).toBe('#orrery')
  })

  it('never carries orrery params to another tab', () => {
    expect(buildHash('earth', someOn, link)).toBe('#earth?layers=iss,quakes')
    expect(buildHash('sun', someOn, link)).toBe('#sun')
  })
})
