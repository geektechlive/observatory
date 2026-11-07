/**
 * #116: a focused planet looked dull and grey because the camera kept its old direction
 * and could see the planet from its night side (Jupiter drew at half its map's brightness).
 * Focusing a planet now approaches from the sunlit side, within MAX_FOCUS_PHASE_DEG.
 */
import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { MAX_FOCUS_PHASE_DEG, sunlitFocusDirection } from '@/components/orrery/three/framing'

const SUN = new Vector3(0, 0, 0)
const deg = (a: Vector3, b: Vector3) => (a.angleTo(b) * 180) / Math.PI

describe('sunlitFocusDirection (#116)', () => {
  const planet = new Vector3(10, 0, 0)
  const toSun = SUN.clone().sub(planet).normalize()

  it('keeps a direction that already sees the lit side', () => {
    const current = new Vector3(-1, 0.3, 0.2).normalize()
    const dir = sunlitFocusDirection(planet, SUN, current)
    expect(deg(dir, current)).toBeLessThan(1e-6)
  })

  it('swings a night-side view round to the phase limit, no further', () => {
    const current = new Vector3(1, 0.4, 0.3).normalize() // looking at the night side
    const dir = sunlitFocusDirection(planet, SUN, current)
    expect(deg(dir, toSun)).toBeCloseTo(MAX_FOCUS_PHASE_DEG, 6)
    expect(dir.length()).toBeCloseTo(1, 9)
  })

  it('keeps the side it came from (the camera does not jump across)', () => {
    const current = new Vector3(0.5, 0, 1).normalize() // +z side
    const dir = sunlitFocusDirection(planet, SUN, current)
    expect(dir.z).toBeGreaterThan(0)
  })

  it('still answers when the camera is exactly behind the planet', () => {
    const dir = sunlitFocusDirection(planet, SUN, new Vector3(1, 0, 0))
    expect(deg(dir, toSun)).toBeCloseTo(MAX_FOCUS_PHASE_DEG, 6)
  })

  // Mercury (scene 0.43 from the Sun, focus distance 1.2, corona 0.40): the full turn
  // carried the camera past the Sun and its corona filled the view behind Mercury, as did
  // the old night-side view (seen on a real GPU). Measured in the view, not by distance.
  it('turns only as far as keeps the Sun off the planet in view (Mercury)', () => {
    const mercury = new Vector3(0.43, 0, 0)
    const clear = { distance: 1.2, sunClearance: 0.4 }
    const current = new Vector3(1, 0.2, 0.4).normalize() // night side, Sun behind Mercury
    const dir = sunlitFocusDirection(mercury, SUN, current, clear)
    const camera = mercury.clone().addScaledVector(dir, clear.distance)
    const toSun = SUN.clone().sub(camera)
    const corona = Math.asin(clear.sunClearance / toSun.length())
    expect(toSun.length()).toBeGreaterThan(clear.sunClearance)
    expect(toSun.angleTo(mercury.clone().sub(camera))).toBeGreaterThan(corona)
    // ...while seeing more of the lit side than the night-side view did.
    const sunward = SUN.clone().sub(mercury)
    expect(deg(dir, sunward)).toBeLessThan(deg(current, sunward))
  })

  it('leaves the Sun itself alone', () => {
    const current = new Vector3(0, 0.5, 1).normalize()
    expect(deg(sunlitFocusDirection(SUN, SUN, current), current)).toBeLessThan(1e-6)
  })
})
