/**
 * The satellite layer (#98) without a GPU: it draws the worker's buffers as they are
 * (no copy), colours each point by its group's category, shows points or haze by the
 * camera's distance, picks the nearest point, and describes a satellite for the
 * inspector.
 */
import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { satKey, SatLayer } from '@/components/orrery/three/satLayer'
import { SAT_OK, SAT_OUT_OF_WINDOW } from '@/lib/orbit/bulk/satField'
import type { SatFieldInfo } from '@/lib/orbit/bulk/satHandler'
import type { SatFrameReply, SatWorker } from '@/lib/orbit/bulk/satsClient'
import type { SatGroupId } from '@/lib/orbit/satCatalog'
import { EARTH_RADIUS_KM } from '@/lib/orrery/earthFrame'

const T0 = Date.parse('2026-11-07T12:00:00Z')
const JD = 2_461_352
const ISS_KM: [number, number, number] = [EARTH_RADIUS_KM + 420, 0, 0]

function field(version: number, groups: SatGroupId[]): SatFieldInfo {
  return {
    version,
    groups: groups.map((group, i) => ({ group, start: i, count: 1 })),
    ids: groups.map((g) => (g === 'stations' ? '25544' : '44713')),
    names: groups.map((g) => (g === 'stations' ? 'ISS (ZARYA)' : 'STARLINK-1007')),
    epochMs: new Float64Array(groups.length).fill(T0 - 3_600_000),
  }
}

function fakeWorker(statuses: number[]) {
  let loaded: SatGroupId[] = []
  let version = 0
  const worker: SatWorker = {
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
        engine: 'wasm',
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

  it('has no position for an object outside its epoch window', async () => {
    const { layer } = await loadedLayer(['stations'], [SAT_OUT_OF_WINDOW])
    expect(layer.info(satKey('25544'))?.teme).toBeNull()
    expect(layer.snapshot()).toMatchObject({ drawn: 0, outOfWindow: 1 })
  })
})
