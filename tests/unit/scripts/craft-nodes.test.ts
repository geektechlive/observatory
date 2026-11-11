import { Document } from '@gltf-transform/core'
import { describe, expect, it } from 'vitest'

// @ts-expect-error plain ESM script, no type declarations
import { dropNodes } from '../../../scripts/craft-nodes.mjs'

function scene() {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const root = doc.createScene()
  const add = (name: string) => {
    const positions = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
      .setBuffer(buffer)
    const prim = doc.createPrimitive().setAttribute('POSITION', positions)
    const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim))
    root.addChild(node)
  }
  add('keep')
  add('stray1')
  add('stray2')
  return doc
}

const names = (doc: Document) =>
  doc
    .getRoot()
    .listNodes()
    .map((n) => n.getName())

describe('dropNodes (#194)', () => {
  it('removes the named nodes and leaves the others', () => {
    const doc = scene()
    dropNodes(doc, ['stray1', 'stray2'])
    expect(names(doc)).toEqual(['keep'])
  })

  it('removes their meshes too, so nothing of them is written', () => {
    const doc = scene()
    dropNodes(doc, ['stray1'])
    expect(
      doc
        .getRoot()
        .listMeshes()
        .map((m) => m.getName()),
    ).toEqual(['keep', 'stray2'])
  })

  it('throws when a name matches no node, so a stale list cannot pass', () => {
    expect(() => dropNodes(scene(), ['nope'])).toThrow(/nope/)
  })
})
