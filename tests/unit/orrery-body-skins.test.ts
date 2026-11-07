import { Color, Mesh, MeshBasicMaterial, SphereGeometry, Texture, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { BodySkins, fadeCorona, SKIN_MIN_PX } from '@/components/orrery/three/bodySkins'
import type { BodyName } from '@/lib/orrery/bodies'
import { type PlanetName, PLANETS } from '@/lib/orrery/elements'
import { poleEcliptic } from '@/lib/orrery/imagery'

function flatBodies() {
  const bodies = new Map<BodyName, Mesh>()
  for (const name of ['Sun', ...PLANETS] as BodyName[]) {
    bodies.set(
      name,
      new Mesh(new SphereGeometry(1), new MeshBasicMaterial({ color: new Color('#888888') })),
    )
  }
  return bodies
}

const flush = () => new Promise((r) => setTimeout(r, 0))
const dotVisible = (bodies: Map<BodyName, Mesh>, name: BodyName) =>
  (bodies.get(name)?.material as MeshBasicMaterial).visible
const skinOf = (bodies: Map<BodyName, Mesh>, name: PlanetName) =>
  bodies.get(name)?.children.find((c) => c.name === `${name}:skin`)

describe('fadeCorona (#105)', () => {
  // The square crop cut the corona off in a straight edge when zoomed in on the Sun.
  it('keeps the disc and fades the frame to black before its edge', () => {
    const size = 100
    const px = new Uint8ClampedArray(size * size * 4).fill(200)
    fadeCorona(px, size)
    const at = (x: number, y: number) => px[(y * size + x) * 4] ?? -1
    expect(at(50, 50)).toBe(200)
    expect(at(50, 20)).toBe(200)
    expect(at(0, 50)).toBe(0)
    expect(at(0, 0)).toBe(0)
    expect(at(99, 50)).toBeLessThan(10)
    expect(px[(50 * size + 0) * 4 + 3]).toBe(200)
  })
})

describe('BodySkins (#105)', () => {
  it('gives each planet a hidden mapped twin, and Saturn its rings', () => {
    const bodies = flatBodies()
    new BodySkins(
      () => Promise.resolve(new Texture()),
      () => undefined,
    ).build(bodies)
    for (const p of PLANETS) expect(skinOf(bodies, p)?.visible).toBe(false)
    expect(skinOf(bodies, 'Saturn')?.children.map((c) => c.name)).toEqual(['Saturn:rings'])
  })

  it('keeps the flat dot, and downloads nothing, while a planet is small', () => {
    const bodies = flatBodies()
    const load = vi.fn<(url: string) => Promise<Texture>>(() => Promise.resolve(new Texture()))
    const skins = new BodySkins(load, () => undefined)
    skins.build(bodies)
    expect(skins.apply(() => SKIN_MIN_PX - 1, bodies)).toEqual([])
    expect(load).not.toHaveBeenCalled()
    expect(dotVisible(bodies, 'Jupiter')).toBe(true)
  })

  it('loads a map once on first need, then swaps the dot for it', async () => {
    const bodies = flatBodies()
    const load = vi.fn<(url: string) => Promise<Texture>>(() => Promise.resolve(new Texture()))
    const onReady = vi.fn()
    const skins = new BodySkins(load, onReady)
    skins.build(bodies)
    const size = (p: PlanetName) => (p === 'Jupiter' ? 40 : 2)
    expect(skins.apply(size, bodies)).toEqual([])
    skins.apply(size, bodies)
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith('/textures/planets/jupiter.webp')
    await flush()
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(skins.apply(size, bodies)).toEqual(['Jupiter'])
    expect(dotVisible(bodies, 'Jupiter')).toBe(false)
    expect(skinOf(bodies, 'Jupiter')?.visible).toBe(true)
  })

  it('loads Saturn’s ring strip with its map and shows the rings with it', async () => {
    const bodies = flatBodies()
    const load = vi.fn<(url: string) => Promise<Texture>>(() => Promise.resolve(new Texture()))
    const skins = new BodySkins(load, () => undefined)
    skins.build(bodies)
    const size = (p: PlanetName) => (p === 'Saturn' ? 40 : 2)
    skins.apply(size, bodies)
    expect(load.mock.calls.map((c) => c[0])).toEqual([
      '/textures/planets/saturn.webp',
      '/textures/planets/saturn-rings.webp',
    ])
    await flush()
    skins.apply(size, bodies)
    const rings = skinOf(bodies, 'Saturn')?.children[0] as Mesh<SphereGeometry, MeshBasicMaterial>
    expect(rings.material.visible).toBe(true)
  })

  it('keeps the flat dot when a map fails to load', async () => {
    const bodies = flatBodies()
    const skins = new BodySkins(
      () => Promise.reject(new Error('404')),
      () => undefined,
    )
    skins.build(bodies)
    const size = (p: PlanetName) => (p === 'Mars' ? 40 : 2)
    skins.apply(size, bodies)
    await flush()
    expect(skins.apply(size, bodies)).toEqual([])
    expect(dotVisible(bodies, 'Mars')).toBe(true)
  })

  it('shades Venus and Uranus without any download', () => {
    const bodies = flatBodies()
    const load = vi.fn<(url: string) => Promise<Texture>>(() => Promise.resolve(new Texture()))
    const skins = new BodySkins(load, () => undefined)
    skins.build(bodies)
    const size = (p: PlanetName) => (p === 'Venus' || p === 'Uranus' ? 40 : 2)
    expect(skins.apply(size, bodies)).toEqual(['Venus', 'Uranus'])
    expect(load).not.toHaveBeenCalled()
  })

  it('tilts each skin to its pole (scene +y is ecliptic north) and spins it with the date', () => {
    const bodies = flatBodies()
    const skins = new BodySkins(
      () => Promise.resolve(new Texture()),
      () => undefined,
    )
    skins.build(bodies)
    skins.orient(2451545)
    const skin = skinOf(bodies, 'Uranus')
    const quat = () => {
      if (!skin) throw new Error('no Uranus skin')
      return skin.quaternion
    }
    const axis = new Vector3(0, 1, 0).applyQuaternion(quat())
    const p = poleEcliptic('Uranus')
    expect(axis.distanceTo(new Vector3(p.x, p.z, -p.y))).toBeLessThan(1e-9)
    const before = skin?.quaternion.clone()
    skins.orient(2451545.1)
    expect(skin?.quaternion.equals(before ?? skin.quaternion)).toBe(false)
    // The spin is about the pole, so the pole itself does not move.
    const after = new Vector3(0, 1, 0).applyQuaternion(quat())
    expect(after.distanceTo(axis)).toBeLessThan(1e-9)
  })
})
