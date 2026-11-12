/**
 * #138: Earth's map in the orrery turns with Greenwich, so a satellite is drawn over the
 * place it is really above. The truth is satellite.js's own sub-satellite point for the
 * ISS; the drawn point is where the satellite layer puts it (satScenePosition), read back
 * through Earth's skin (BodySkins) onto the map as SphereGeometry lays it out (lon 0 at
 * local +x, east toward −z: latLonToVec3, the globe's mapping on the same texture).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import * as satellite from 'satellite.js'
import { Mesh, MeshBasicMaterial, SphereGeometry, Texture, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { BodySkins } from '@/components/orrery/three/bodySkins'
import { vec3ToLatLon } from '@/lib/globe3d'
import { jdFromDate } from '@/lib/orrery/kepler'
import { satScenePosition, temeToScene } from '@/lib/orrery/satView'

const omm = (
  JSON.parse(readFileSync(join(__dirname, 'fixtures/celestrak-omm.json'), 'utf8')) as {
    active: satellite.OMMJsonObject[]
  }
).active.find((r) => String(r.NORAD_CAT_ID) === '25544')
if (!omm) throw new Error('ISS missing from the fixture')
const satrec = satellite.json2satrec(omm)

/** Earth's mapped skin as the renderer orients it for a date (BodySkins.orient). */
function earthSkinAt(jd: number): Mesh {
  const skins = new BodySkins(
    () => Promise.resolve(new Texture()),
    () => undefined,
  )
  const earth = new Mesh(new SphereGeometry(1), new MeshBasicMaterial())
  skins.build(new Map([['Earth', earth]]))
  skins.orient(jd)
  const skin = earth.children.find((c) => c.name === 'Earth:skin')
  if (!(skin instanceof Mesh)) throw new Error('no Earth skin')
  return skin
}

/** Longitude difference wrapped to [-180, 180]. */
const dLon = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180

describe("Earth's map turns with Greenwich (#138)", () => {
  // Inside a day of the fixture's epoch (2026-11-06 11:57 UTC), at different hours.
  const DATES = ['2026-11-06T12:00:00Z', '2026-11-06T18:40:00Z', '2026-11-07T03:17:00Z']

  it.each(DATES)('draws the ISS over its sub-satellite point at %s', (iso) => {
    const date = new Date(iso)
    const pv = satellite.propagate(satrec, date)
    if (!pv) throw new Error('SGP4 failed')
    const gmst = satellite.gstime(date)
    const geo = satellite.eciToGeodetic(pv.position, gmst)
    const ecf = satellite.eciToEcf(pv.position, gmst)
    const truthLon = satellite.degreesLong(geo.longitude)
    // Geocentric latitude: the map is a sphere, not the ellipsoid.
    const truthLat = (Math.asin(ecf.z / Math.hypot(ecf.x, ecf.y, ecf.z)) * 180) / Math.PI

    const jd = jdFromDate(date)
    const { x, y, z } = pv.position
    const drawn = satScenePosition([x, y, z], temeToScene(jd), { x: 0, y: 0, z: 0 }, 1)
    if (!drawn) throw new Error('no drawn position')
    const skin = earthSkinAt(jd)
    const local = new Vector3(drawn.x, drawn.y, drawn.z).applyQuaternion(
      skin.quaternion.clone().invert(),
    )
    const onMap = vec3ToLatLon([local.x, local.y, local.z])

    expect(Math.abs(dLon(onMap.lon, truthLon))).toBeLessThan(0.05)
    expect(Math.abs(onMap.lat - truthLat)).toBeLessThan(0.05)
  })
})
