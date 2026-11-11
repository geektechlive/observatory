import { Document } from '@gltf-transform/core'
import { describe, expect, it } from 'vitest'

// @ts-expect-error plain ESM script, no type declarations
import { dropNodes, plainMaterials } from '../../../scripts/craft-nodes.mjs'

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

describe('plainMaterials (#194)', () => {
  function textured() {
    const doc = new Document()
    const tex = doc
      .createTexture('foil_n')
      .setImage(new Uint8Array([1, 2, 3]))
      .setMimeType('image/png')
    doc.createMaterial('shiny_panel').setBaseColorTexture(tex).setBaseColorFactor([1, 1, 1, 1])
    doc.createMaterial('other').setBaseColorTexture(tex)
    return doc
  }
  const material = (doc: Document, name: string) =>
    doc
      .getRoot()
      .listMaterials()
      .find((m) => m.getName() === name)

  it('draws the named material in a plain colour, without its colour texture', () => {
    const doc = textured()
    plainMaterials(doc, { shiny_panel: [0.3, 0.3, 0.32, 1] })
    expect(material(doc, 'shiny_panel')?.getBaseColorTexture()).toBeNull()
    expect(material(doc, 'shiny_panel')?.getBaseColorFactor()).toEqual([0.3, 0.3, 0.32, 1])
  })

  it('leaves other materials as they are', () => {
    const doc = textured()
    plainMaterials(doc, { shiny_panel: [0.3, 0.3, 0.32, 1] })
    expect(material(doc, 'other')?.getBaseColorTexture()?.getName()).toBe('foil_n')
  })

  it('throws when a name matches no material, so a stale entry cannot pass', () => {
    expect(() => plainMaterials(textured(), { nope: [0, 0, 0, 1] })).toThrow(/nope/)
  })
})
