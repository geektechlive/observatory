/**
 * The satellite layer (#98) without a GPU: it draws the worker's buffers as they are
 * (no copy), colours each point by its group's category, shows points or haze by the
 * camera's distance, picks the nearest point, and describes a satellite for the
 * inspector.
 */
import { Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { satKey, SatLayer } from '@/components/orrery/three/satLayer'
import { SAT_OK, SAT_OUT_OF_WINDOW } from '@/lib/orbit/bulk/satField'
import type { SatFieldInfo } from '@/lib/orbit/bulk/satHandler'
import type { SatFrameReply, SatWorker } from '@/lib/orbit/bulk/satsClient'
import type { SatFieldGroup, SatGroupId } from '@/lib/orbit/satCatalog'
import { EARTH_RADIUS_KM } from '@/lib/orrery/earthFrame'

const T0 = Date.parse('2026-11-07T12:00:00Z')
const JD = 2_461_352
const ISS_KM: [number, number, number] = [EARTH_RADIUS_KM + 420, 0, 0]

const idOf = (g: SatFieldGroup) =>
  g === 'stations' ? '25544' : g === 'reentry' ? '53630' : '44713'
const nameOf = (g: SatFieldGroup) =>
  g === 'stations' ? 'ISS (ZARYA)' : g === 'reentry' ? 'STARLINK-4598' : 'STARLINK-1007'

function field(version: number, groups: SatFieldGroup[]): SatFieldInfo {
  return {
    version,
    groups: groups.map((group, i) => ({ group, start: i, count: 1 })),
    ids: groups.map(idOf),
    names: groups.map(nameOf),
    epochMs: new Float64Array(groups.length).fill(T0 - 3_600_000),
    orbit: new Uint8Array(groups.length),
    launch: new Int32Array(groups.length),
    // The fake's Starlink carries SupGP elements (#209).
    supgp: Uint8Array.from(groups.map((g) => (g === 'starlink' ? 1 : 0))),
  }
}

function fakeWorker(statuses: number[]) {
  let loaded: SatFieldGroup[] = []
  let version = 0
  const worker: SatWorker = {
    failed: false,
    loadReentry(rows) {
      loaded = [
        ...loaded.filter((g) => g !== 'reentry'),
        ...(rows.length > 0 ? ['reentry' as const] : []),
      ]
      version += 1
      return Promise.resolve({
        type: 'loaded',
        id: 0,
        group: 'reentry',
        count: rows.length,
        dropped: 0,
        ms: 1,
        field: field(version, loaded),
      })
    },
    load(body) {
      loaded = [...loaded, new TextDecoder().decode(body) as SatGroupId]
      version += 1
      return Promise.resolve({
        type: 'loaded',
        id: 0,
        group: loaded.at(-1) ?? 'stations',
        count: 1,
        dropped: 0,
        ms: 1,
        field: field(version, loaded),
      })
    },
    unload(group) {
      loaded = loaded.filter((g) => g !== group)
      version += 1
      return Promise.resolve({ type: 'unloaded', id: 0, group, field: field(version, loaded) })
    },
    propagate(date) {
      const positions = new Float32Array(loaded.length * 3)
      loaded.forEach((g, i) => {
        positions.set(g === 'stations' ? ISS_KM : [EARTH_RADIUS_KM + 550, 0, 0], i * 3)
      })
      const reply: SatFrameReply = {
        type: 'frame',
        id: 0,
        dateMs: date.getTime(),
        version,
        positions,
        status: Uint8Array.from(loaded.map((_, i) => statuses[i] ?? SAT_OK)),
        ms: 3,
        engine: 'js',
      }
      return Promise.resolve(reply)
    },
    release: () => undefined,
    terminate: () => undefined,
  }
  return worker
}

const flush = async () => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve()
}

async function loadedLayer(groups: SatGroupId[], statuses: number[] = []) {
  const layer = new SatLayer(() => undefined, {
    fetchGroup: (g) =>
      Promise.resolve({
        body: new TextEncoder().encode(g).buffer,
        degraded: false,
        dataAgeSeconds: 0,
      }),
    worker: () => Promise.resolve(fakeWorker(statuses)),
  })
  layer.setEnabled(new Set(groups))
  const earth = new Vector3(1, 0, 0)
  const at = (cameraRe: number) => ({
    jd: JD,
    simMs: T0,
    wallMs: 0,
    rate: 1,
    earth,
    radius: 0.01,
    openness: 1,
    camera: new Vector3(1, 0, 0.01 * cameraRe),
    pixelRatio: 1,
  })
  layer.place(at(20))
  await flush()
  layer.place(at(20))
  await flush()
  layer.place(at(20))
  return { layer, at, earth }
}

const pointsOf = (layer: SatLayer) => layer.group.getObjectByName('satellites')
const hazeOf = (layer: SatLayer) => layer.group.getObjectByName('satellite-haze')

describe('SatLayer (#98)', () => {
  it('draws the worker’s position buffer as is, coloured by category', async () => {
    const { layer } = await loadedLayer(['stations', 'starlink'])
    const points = pointsOf(layer) as unknown as {
      visible: boolean
      geometry: { getAttribute: (n: string) => { array: ArrayLike<number> } }
    }
    expect(points.visible).toBe(true)
    expect(points.geometry.getAttribute('position').array).toHaveLength(6)
    // station is category 0, starlink 1 (CATEGORIES order).
    expect(Array.from(points.geometry.getAttribute('category').array)).toEqual([0, 1])
    expect(layer.mode()).toBe('points')
    expect(layer.snapshot()).toMatchObject({ total: 2, drawn: 2 })
  })

  it('turns to haze when pulled back and hides when the frame is closed', async () => {
    const { layer, at } = await loadedLayer(['stations'])
    layer.place(at(120))
    expect(layer.mode()).toBe('haze')
    expect(pointsOf(layer)?.visible).toBe(false)
    expect(hazeOf(layer)?.visible).toBe(true)
    layer.place({ ...at(20), openness: 0 })
    expect(layer.mode()).toBe('hidden')
    expect(hazeOf(layer)?.visible).toBe(false)
  })

  it('picks the nearest drawn point, and only while points are pickable', async () => {
    const { layer, at } = await loadedLayer(['stations', 'starlink'])
    // A projection that puts the scene's x axis on screen x, 1000 px per unit.
    const project = (v: Vector3) => ({ x: v.x * 1000, y: 0 })
    const iss = layer.info(satKey('25544'))
    expect(iss?.teme).not.toBeNull()
    // The ISS (420 km up) lands nearer Earth than Starlink (550 km).
    const issX = (1 + 0.01 * ((EARTH_RADIUS_KM + 420) / EARTH_RADIUS_KM)) * 1000
    expect(layer.pick(issX, 0, 12, project)).toBe(satKey('25544'))
    layer.place(at(120))
    expect(layer.pick(issX, 0, 12, project)).toBeNull()
  })

  it('describes a satellite for the inspector, and marks the chosen one', async () => {
    const { layer, at } = await loadedLayer(['stations'])
    const info = layer.info(satKey('25544'))
    expect(info).toMatchObject({ name: 'ISS (ZARYA)', noradId: '25544', group: 'stations' })
    expect(info?.epochMs).toBe(T0 - 3_600_000)
    layer.setSelected(satKey('25544'))
    layer.place(at(20))
    expect(layer.marker.visible).toBe(true)
    expect(layer.selectedLabel()).toEqual({ key: 'sat:25544', label: 'ISS (ZARYA)' })
    expect(layer.listGroup('stations')).toEqual([{ key: 'sat:25544', name: 'ISS (ZARYA)' }])
  })

  it('says which objects carry SupGP elements, for the inspector’s source line (#209)', async () => {
    const { layer } = await loadedLayer(['stations', 'starlink'])
    expect(layer.info(satKey('25544'))?.supgp).toBe(false)
    expect(layer.info(satKey('44713'))?.supgp).toBe(true)
  })

  it('rings the objects predicted to re-enter, where loaded and drawn (#101)', async () => {
    const { layer, at } = await loadedLayer(['stations', 'starlink'])
    layer.setFlagged(['44713', '99999'])
    layer.place(at(20))
    const rings = layer.flagRings()
    expect(rings).toHaveLength(1)
    expect(rings[0]?.visible).toBe(true)
    // At the Starlink's drawn position, facing the camera.
    const starlink = layer.positionOf('44713')
    expect(rings[0]?.position.distanceTo(starlink ?? new Vector3())).toBeLessThan(1e-9)
    layer.place(at(120))
    expect(layer.flagRings()).toHaveLength(0)
    layer.setFlagged([])
    layer.place(at(20))
    expect(layer.flagRings()).toHaveLength(0)
  })

  it('draws the re-entry rings over Earth: no depth test, after the Earth (#199)', async () => {
    const { layer, at } = await loadedLayer(['stations', 'starlink'])
    layer.setFlagged(['44713'])
    layer.place(at(20))
    const ring = layer.flagRings()[0]
    expect(ring?.material.depthTest).toBe(false)
    expect(ring?.material.depthWrite).toBe(false)
    expect(ring?.renderOrder).toBeGreaterThan(0)
  })

  it('rings and names a re-entry object although no group is switched on (#154)', async () => {
    const { layer, at } = await loadedLayer([])
    layer.setReentryRows([['STARLINK-4598', '53630']])
    layer.setFlagged(['53630', '99999'])
    layer.place(at(20))
    await flush()
    layer.place(at(20))
    await flush()
    layer.place(at(20))
    expect(layer.flagRings()).toHaveLength(1)
    expect(layer.info(satKey('53630'))).toMatchObject({ name: 'STARLINK-4598', group: 'reentry' })
    const [target] = layer.reentryLabels()
    expect(target).toMatchObject({ noradId: '53630', name: 'STARLINK-4598' })
    expect(
      target?.ring.position.distanceTo(layer.positionOf('53630') ?? new Vector3()),
    ).toBeLessThan(1e-9)
    // Counts describe the switchable groups only.
    expect(layer.snapshot().total).toBe(0)
    layer.place(at(120))
    expect(layer.reentryLabels()).toEqual([])
  })

  describe('rings for a satellite behind Earth are dimmed, not drawn as if in front', () => {
    // The fake puts every satellite on Earth's +x side; Earth is at (1, 0, 0), 0.01 across.
    const facing = new Vector3(1.2, 0, 0)
    const behind = new Vector3(0.8, 0, 0)
    const bandOpacity = (layer: SatLayer) => {
      const [halo, band] = layer.selectRing.children as unknown as {
        visible: boolean
        material: { opacity: number }
      }[]
      return { band: band?.material.opacity ?? -1, halo: halo?.visible ?? true }
    }

    it('draws the chosen ring at full strength in front, dim and without its backplate behind (#140)', async () => {
      const { layer, at } = await loadedLayer(['stations'])
      layer.setSelected(satKey('25544'))
      layer.place({ ...at(20), camera: facing })
      expect(layer.selectRing.visible).toBe(true)
      expect(bandOpacity(layer)).toEqual({ band: 1, halo: true })
      layer.place({ ...at(20), camera: behind })
      expect(layer.selectRing.visible).toBe(true)
      expect(bandOpacity(layer).band).toBeLessThan(0.4)
      expect(bandOpacity(layer).halo).toBe(false)
    })

    it('dims a re-entry ring behind Earth the same way (#101)', async () => {
      const { layer, at } = await loadedLayer(['stations', 'starlink'])
      layer.setFlagged(['44713'])
      layer.place({ ...at(20), camera: facing })
      const front = layer.flagRings()[0]?.material.opacity ?? 0
      layer.place({ ...at(20), camera: behind })
      const back = layer.flagRings()[0]?.material.opacity ?? 1
      expect(front).toBeGreaterThan(0.8)
      expect(back).toBeLessThan(0.4)
    })
  })

  it('fades the points when Earth is small on screen (#198)', async () => {
    const { layer, at } = await loadedLayer(['stations'])
    const alpha = (earthPx?: number) => {
      layer.place(earthPx === undefined ? at(20) : { ...at(20), earthPx })
      return (
        pointsOf(layer) as unknown as { material: { uniforms: { uAlpha: { value: number } } } }
      ).material.uniforms.uAlpha.value
    }
    const full = alpha()
    expect(alpha(250)).toBeCloseTo(full, 9)
    expect(alpha(50)).toBeLessThan(full * 0.4)
    expect(alpha(50)).toBeGreaterThan(0)
  })

  describe('before a pass covers the loaded field (#206)', () => {
    /** The ISS's info once its group has landed, with `propagate` as given. */
    async function landed(
      propagate: SatWorker['propagate'],
      closeBeforeLanding = false,
    ): Promise<ReturnType<SatLayer['info']>> {
      const worker = fakeWorker([])
      worker.propagate = propagate
      const layer = new SatLayer(() => undefined, {
        fetchGroup: (g) =>
          Promise.resolve({
            body: new TextEncoder().encode(g).buffer,
            degraded: false,
            dataAgeSeconds: 0,
          }),
        worker: () => Promise.resolve(worker),
      })
      layer.setEnabled(new Set<SatGroupId>(['stations']))
      const at = (openness: number) => ({
        jd: JD,
        simMs: T0,
        wallMs: 0,
        rate: 1,
        earth: new Vector3(1, 0, 0),
        radius: 0.01,
        openness,
        camera: new Vector3(1, 0, 0.2),
        pixelRatio: 1,
      })
      layer.place(at(1))
      // The camera pulls away from Earth before the group lands: no pass is asked.
      if (closeBeforeLanding) layer.place(at(0))
      await flush()
      return layer.info(satKey('25544'))
    }

    it('is pending while a pass is on its way', async () => {
      const info = await landed(() => new Promise<SatFrameReply>(() => undefined))
      expect(info?.teme).toBeNull()
      expect(info?.pending).toBe(true)
      expect(info?.computed).toBe(false)
    })

    it('is not pending once the pass failed', async () => {
      const info = await landed(() => Promise.reject(new Error('worker')))
      expect(info?.pending).toBe(false)
      expect(info?.computed).toBe(false)
    })

    it('is not pending when no pass was asked (Earth frame closed)', async () => {
      const ask = vi.fn(() => new Promise<SatFrameReply>(() => undefined))
      const info = await landed(ask, true)
      expect(ask).not.toHaveBeenCalled()
      expect(info?.pending).toBe(false)
      expect(info?.computed).toBe(false)
    })
  })

  it('has no position for an object outside its epoch window', async () => {
    const { layer } = await loadedLayer(['stations'], [SAT_OUT_OF_WINDOW])
    expect(layer.info(satKey('25544'))?.pending).toBe(false)
    expect(layer.info(satKey('25544'))?.computed).toBe(true)
    expect(layer.info(satKey('25544'))?.teme).toBeNull()
    expect(layer.snapshot()).toMatchObject({ drawn: 0, outOfWindow: 1 })
  })
})
