/**
 * The orrery's "Bright asteroids" switch (#99 item 4): off at first, its status line, a
 * link by key asking for the data, and the layer drawing the group only when it is on.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Vector3 } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SmallBodyControls } from '@/components/orrery/SmallBodyControls'
import { SmallBodyLayer } from '@/components/orrery/three/smallBodyLayer'
import { asteroidStatus, isAsteroidKey } from '@/lib/orrery/smallBodyView'
import type { OrrerySmallBody } from '@/schemas/orrerySmallBodies'

afterEach(cleanup)

const OFF = { comets: false, interstellar: false, asteroids: false, dwarfs: false }

describe('SmallBodyControls: Bright asteroids', () => {
  it('starts off, and switching it on changes only the asteroids group', () => {
    const onGroups = vi.fn()
    render(<SmallBodyControls groups={OFF} onGroups={onGroups} status="" />)
    const sw = screen.getByRole('switch', { name: /Bright asteroids/ })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    expect(onGroups).toHaveBeenCalledWith({ ...OFF, asteroids: true })
  })

  it('shows its own status line', () => {
    render(
      <SmallBodyControls
        groups={{ ...OFF, asteroids: true }}
        onGroups={() => undefined}
        status=""
        asteroidStatus="3 bright asteroids this week, from JPL Horizons"
      />,
    )
    expect(screen.getByRole('status').textContent).toMatch(/3 bright asteroids/)
  })
})

describe('asteroidStatus and isAsteroidKey', () => {
  it('says nothing until asked, then loading, then the count, or that it failed', () => {
    expect(asteroidStatus({ status: 'pending', enabled: false, count: 0 })).toBe('')
    expect(asteroidStatus({ status: 'pending', enabled: true, count: 0 })).toMatch(/Loading/)
    expect(asteroidStatus({ status: 'error', enabled: true, count: 0 })).toMatch(/not available/)
    expect(asteroidStatus({ status: 'success', enabled: true, count: 1 })).toMatch(
      /^1 bright asteroid /,
    )
  })

  it('tells an asteroid link from a comet link and from Ceres, which is a dwarf planet', () => {
    expect(isAsteroidKey('sbc:20000004')).toBe(true)
    expect(isAsteroidKey('sbc:1004035')).toBe(false)
    expect(isAsteroidKey('sbc:20000001')).toBe(false)
    expect(isAsteroidKey('lookup:20000004')).toBe(false)
  })
})

describe('SmallBodyLayer: the asteroids group', () => {
  const START = 2461326.5
  const body: OrrerySmallBody = {
    id: 'sb:20000004',
    spkid: '20000004',
    des: '4 Vesta',
    name: '4 Vesta',
    kind: 'asteroid',
    interstellar: false,
    discovered: null,
    magnitude: null,
    m1: null,
    k1: null,
    h: 3.25,
    elements: { epochJd: START, e: 0.09, q: 2.15, tp: START, om: 100, w: 150, i: 7 },
    elementsSource: 'horizons',
    vInfKms: null,
    solution: null,
    target: null,
    availableFrom: null,
    availableTo: null,
    fine: {
      start: START,
      step: 1,
      samples: Array.from({ length: 10 }, (_, i) => [2.2, 0.1 * i, 0, 0, 0.01, 0]).flat(),
    },
    coarse: null,
  }
  const toScene = (p: { x: number; y: number; z: number }) => new Vector3(p.x, p.z, -p.y)
  const layer = (groups: typeof OFF) => {
    const l = new SmallBodyLayer()
    l.set([{ key: 'sbc:20000004', label: '4 Vesta', group: 'asteroids', body }])
    l.setGroups(groups)
    l.place(START + 3.5, toScene, 'exaggerated')
    return l
  }

  it('draws nothing while the group is off', () => {
    expect(layer(OFF).drawn('sbc:20000004')).toBe(false)
  })

  it('draws a marker on its samples when the group is on, and hides it outside them', () => {
    const l = layer({ ...OFF, asteroids: true })
    expect(l.drawn('sbc:20000004')).toBe(true)
    l.place(START + 30, toScene, 'exaggerated')
    expect(l.drawn('sbc:20000004')).toBe(false)
  })
})
