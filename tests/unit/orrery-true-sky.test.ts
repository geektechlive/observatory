/**
 * The fly-in's surroundings in the scene (#261): every body at its true place and size in the
 * close-up's units, the Sun's light where the Sun is, and the real stars round the camera.
 */
import { type PointLight, type Points, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { STAR_SPHERE, starColour, toScene, TrueSky } from '@/components/orrery/three/trueSky'
import { BRIGHT_STAR_STRIDE, BRIGHT_STARS } from '@/lib/orrery/brightStars'
import type { Surroundings } from '@/lib/orrery/surroundings'

const never = () => new Promise<never>(() => undefined)
/** Parker: a robust radius of 1.5 m (its 3 m body). */
const MPU = 1.5

function sky() {
  return new TrueSky({ metresPerUnit: MPU, loadTexture: never, onReady: () => undefined })
}

const surroundings = (bodies: Surroundings['bodies']): Surroundings => ({
  jd: 2_461_000.5,
  craftAu: { x: 0.046, y: 0, z: 0 },
  bodies,
  omitted: [],
  omittedNear: [],
})

const SUN = {
  key: 'Sun',
  name: 'Sun',
  kind: 'sun' as const,
  relKm: [-6.86e6, 0, 0] as const,
  radiusKm: 695_700,
}

describe('toScene', () => {
  it('maps ecliptic km to the orrery’s axes in units of the model', () => {
    const v = toScene([1, 2, 3], MPU)
    expect(v.x).toBeCloseTo(1000 / MPU, 9)
    expect(v.y).toBeCloseTo(3000 / MPU, 9)
    expect(v.z).toBeCloseTo(-2000 / MPU, 9)
  })
})

describe('TrueSky (#261)', () => {
  it('puts the Sun at its true place and size, and its light there', () => {
    const s = sky()
    s.update(surroundings([SUN]))
    const sun = s.placed('Sun')
    expect(sun?.position.x).toBeCloseTo((-6.86e6 * 1000) / MPU, -3)
    expect(sun?.radius).toBeCloseTo((695_700 * 1000) / MPU, -3)
    // Seen from the craft (the origin) the Sun is its true angular size: about 5.8° from 9.86 R.
    const angle = Math.asin((sun?.radius ?? 0) / (sun?.position.length() ?? 1))
    expect((angle * 180) / Math.PI).toBeCloseTo(5.82, 1)
    const light = s.group.children.find((c) => (c as PointLight).isPointLight) as PointLight
    expect(light.position.distanceTo(sun?.position ?? new Vector3())).toBe(0)
  })

  it('hides a body the next surroundings leave out (a moon past its samples)', () => {
    const s = sky()
    const io = {
      key: 'naif:501',
      name: 'Io',
      kind: 'moon' as const,
      relKm: [6e8, 0, 0] as const,
      radiusKm: 1_821.49,
    }
    s.update(surroundings([SUN, io]))
    expect(s.placed('naif:501')).not.toBeNull()
    s.update(surroundings([SUN]))
    expect(s.placed('naif:501')).toBeNull()
  })

  it('draws every catalogue star once, on a sphere that follows the camera', () => {
    const s = sky()
    const stars = s.group.getObjectByName('stars')
    const count = (stars?.children ?? []).reduce(
      (n, p) => n + (p as Points).geometry.getAttribute('position').count,
      0,
    )
    expect(count).toBe(BRIGHT_STARS.length / BRIGHT_STAR_STRIDE)
    const first = (stars?.children[0] as Points).geometry.getAttribute('position')
    // The vectors are stored to 4 decimals, so the sphere is true to about 1 part in 10^4.
    const r = Math.hypot(first.getX(0), first.getY(0), first.getZ(0)) / STAR_SPHERE
    expect(r).toBeCloseTo(1, 4)
    const camera = { position: new Vector3(5, 6, 7) }
    s.followCamera(camera as never)
    expect(stars?.position.toArray()).toEqual([5, 6, 7])
  })

  it('tints stars by colour index and dims fainter ones', () => {
    const blue = starColour(-0.2, 1)
    const red = starColour(1.6, 1)
    expect(blue.b).toBeGreaterThan(blue.r)
    expect(red.r).toBeGreaterThan(red.b)
    expect(starColour(0.6, 3).r).toBeLessThan(starColour(0.6, 0).r)
  })

  it('loads a planet’s map only once it looks big enough to show it', () => {
    const asked: string[] = []
    const s = new TrueSky({
      metresPerUnit: MPU,
      loadTexture: (url) => {
        asked.push(url)
        return never()
      },
      onReady: () => undefined,
    })
    const jupiter = (km: number) => ({
      key: 'Jupiter',
      name: 'Jupiter',
      kind: 'planet' as const,
      relKm: [km, 0, 0] as const,
      radiusKm: 69_911,
    })
    // From 5 au Jupiter is a speck: no 2k map for it.
    s.update(surroundings([SUN, jupiter(7.5e8)]))
    expect(asked).toEqual([])
    // From Juno's distance it fills a good part of the sky.
    s.update(surroundings([SUN, jupiter(3e6)]))
    s.update(surroundings([SUN, jupiter(2e6)]))
    expect(asked).toEqual(['/textures/planets/jupiter.webp'])
  })

  it('frees its GPU resources once', () => {
    const s = sky()
    s.update(surroundings([SUN]))
    s.dispose()
    s.dispose()
    expect(s.group.children).toHaveLength(0)
  })
})
