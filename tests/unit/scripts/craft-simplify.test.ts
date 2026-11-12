import { Document, type Primitive } from '@gltf-transform/core'
import { MeshoptSimplifier } from 'meshoptimizer'
import { beforeAll, describe, expect, it } from 'vitest'

// @ts-expect-error plain ESM script, no type declarations
import { simplifyKeeping } from '../../../scripts/craft-simplify.mjs'

/**
 * A model like Fermi's: a large flat body, finely meshed, and an array of small separate cell
 * quads (no shared vertices, every edge open) under its own material.
 */
function model() {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const mesh = doc.createMesh('craft')
  const add = (material: string, positions: number[], indices: number[]) => {
    const prim = doc
      .createPrimitive()
      .setAttribute(
        'POSITION',
        doc
          .createAccessor()
          .setType('VEC3')
          .setArray(new Float32Array(positions))
          .setBuffer(buffer),
      )
      .setIndices(
        doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer),
      )
      .setMaterial(doc.createMaterial(material))
    mesh.addPrimitive(prim)
  }
  // Body: a welded 20 x 20 grid over 10 x 10 units, 800 triangles.
  const body: number[] = []
  const bodyIdx: number[] = []
  const n = 20
  for (let y = 0; y <= n; y += 1)
    for (let x = 0; x <= n; x += 1) body.push((x / n) * 10, (y / n) * 10, 0)
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const a = y * (n + 1) + x
      bodyIdx.push(a, a + 1, a + n + 2, a, a + n + 2, a + n + 1)
    }
  }
  add('GLAST-body', body, bodyIdx)
  // Cells: 10 x 10 separate quads of 0.02 units, 200 triangles.
  const cells: number[] = []
  const cellIdx: number[] = []
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 10; x += 1) {
      const base = cells.length / 3
      const [cx, cy, s] = [x * 0.1, y * 0.1, 0.02]
      cells.push(cx, cy, 1, cx + s, cy, 1, cx + s, cy + s, 1, cx, cy + s, 1)
      cellIdx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }
  add('GPMcore-SolarFaces1.001', cells, cellIdx)
  doc.createScene().addChild(doc.createNode('craft').setMesh(mesh))
  return doc
}

const tris = (doc: Document, material: string) => {
  const prim = doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .find((p: Primitive) => p.getMaterial()?.getName() === material)
  return prim ? (prim.getIndices()?.getCount() ?? 0) / 3 : 0
}

describe('simplifyKeeping (#194, Fermi and ICESat-2)', () => {
  beforeAll(async () => {
    await MeshoptSimplifier.ready
  })

  it('keeps every cell of a material named in keep', async () => {
    const doc = model()
    await simplifyKeeping(doc, {
      simplifier: MeshoptSimplifier,
      ratio: 0.1,
      error: 0.05,
      keep: ['GPMcore-SolarFaces'],
    })
    expect(tris(doc, 'GPMcore-SolarFaces1.001')).toBe(200)
  })

  it('still simplifies the other materials', async () => {
    const doc = model()
    await simplifyKeeping(doc, {
      simplifier: MeshoptSimplifier,
      ratio: 0.1,
      error: 0.05,
      keep: ['GPMcore-SolarFaces'],
    })
    expect(tris(doc, 'GLAST-body')).toBeLessThan(200)
  })

  it('loses cells when it is not kept, which is the hole it prevents', async () => {
    const doc = model()
    await simplifyKeeping(doc, { simplifier: MeshoptSimplifier, ratio: 0.1, error: 0.05, keep: [] })
    expect(tris(doc, 'GPMcore-SolarFaces1.001')).toBeLessThan(200)
  })

  it('throws on a primitive that is not indexed triangles, rather than skip it silently', async () => {
    const doc = model()
    const prim = doc.getRoot().listMeshes()[0]?.listPrimitives()[0]
    prim?.setMode(5) // TRIANGLE_STRIP
    await expect(
      simplifyKeeping(doc, { simplifier: MeshoptSimplifier, ratio: 0.1, error: 0.05, keep: [] }),
    ).rejects.toThrow(/not indexed triangles/)
  })

  it('throws when a prefix matches no material, so a stale entry cannot pass', async () => {
    await expect(
      simplifyKeeping(model(), {
        simplifier: MeshoptSimplifier,
        ratio: 0.1,
        error: 0.05,
        keep: ['Nope'],
      }),
    ).rejects.toThrow(/Nope/)
  })
})
