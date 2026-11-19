import { describe, expect, it } from 'vitest'

import { CanvasClick, escDeselects } from '@/components/orrery/canvasClick'

describe('CanvasClick (#265): a click on the canvas, not a drag or a two-finger gesture', () => {
  it('a press and release in place is a click', () => {
    const c = new CanvasClick()
    c.down(1, 100, 100)
    expect(c.up(1, 102, 101)).toBe(true)
  })

  it('a drag that turns the camera is not a click', () => {
    const c = new CanvasClick()
    c.down(1, 100, 100)
    expect(c.up(1, 140, 100)).toBe(false)
  })

  it('a release with no press on the canvas is not a click', () => {
    expect(new CanvasClick().up(1, 100, 100)).toBe(false)
  })

  it('neither finger of a still two-finger touch is a click, and the next tap is', () => {
    const c = new CanvasClick()
    c.down(1, 100, 100)
    c.down(2, 200, 100)
    expect(c.up(1, 100, 100)).toBe(false)
    expect(c.up(2, 200, 100)).toBe(false)
    c.down(3, 150, 150)
    expect(c.up(3, 150, 150)).toBe(true)
  })

  it('a right or middle press is never a click', () => {
    const c = new CanvasClick()
    c.down(1, 100, 100, false)
    expect(c.up(1, 100, 100)).toBe(false)
  })

  it('a cancelled press is forgotten', () => {
    const c = new CanvasClick()
    c.down(1, 100, 100)
    c.cancel(1)
    expect(c.up(1, 100, 100)).toBe(false)
  })
})

describe('escDeselects (#265): Esc deselects only when nothing else uses it', () => {
  const base = {
    key: 'Escape',
    defaultPrevented: false,
    inField: false,
    selected: true,
    guideOpen: false,
    detailOpen: false,
  }

  it('deselects with a selection and nothing else open', () => {
    expect(escDeselects(base)).toBe(true)
  })

  it.each([
    ['another key', { key: 'Enter' }],
    ['a control already used it', { defaultPrevented: true }],
    ['focus is in a text field or the Find box', { inField: true }],
    ['nothing is selected', { selected: false }],
    ['the guide is open (Esc closes it)', { guideOpen: true }],
    ['the close-up is open (Esc leaves it)', { detailOpen: true }],
  ])('does nothing when %s', (_why, change) => {
    expect(escDeselects({ ...base, ...change })).toBe(false)
  })
})
