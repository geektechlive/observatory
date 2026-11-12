import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// @ts-expect-error plain ESM script, no type declarations
import { BUDGETS } from '../../../scripts/check-bundle.mjs'
import {
  assertSourceFiles,
  blankRegion,
  entryProblems,
  glbWithoutExternalImages,
  promote,
  sha256Hex,
  TRIANGLE_TOLERANCE,
  unknownModels,
  verifySources,
  // @ts-expect-error plain ESM script, no type declarations
} from '../../../scripts/craft-gate.mjs'

const HELLO = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' // sha256('abc')

interface Entry {
  sources: { file: string; sha256: string | null }[]
  [k: string]: unknown
}

const complete = (): Entry => ({
  sources: [{ file: 'a.glb', sha256: HELLO }],
  sourceUrl: 'https://example.test/a',
  sourceVersion: '2026-11-10',
  licence: 'CC0 1.0',
  licenceEvidence: { text: 'Public domain dedication', url: 'https://example.test/licence' },
  family: 'iss',
  logosChecked: { date: '2026-11-10', result: 'clean' },
  triangles: 9000,
})

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'craft-gate-'))
}

describe('entryProblems (#202)', () => {
  it('accepts a complete entry', () => {
    expect(entryProblems(complete())).toEqual([])
  })

  it.each([
    ['sourceUrl', { sourceUrl: '' }],
    ['sourceVersion', { sourceVersion: ' ' }],
    ['licence', { licence: '' }],
    ['licenceEvidence', { licenceEvidence: { text: '', url: 'https://x.test' } }],
    ['family', { family: '' }],
    ['logosChecked', { logosChecked: { date: null, result: 'unrecorded' } }],
    ['logosChecked', { logosChecked: { date: '2026-11-10', result: 'logo found' } }],
    ['triangles', { triangles: 0 }],
    ['sources', { sources: [] }],
    ['sources', { sources: [{ file: 'a.glb', sha256: null }] }],
    ['sources', { sources: [{ file: 'a.glb', sha256: 'abc' }] }],
  ])('names %s when it is missing or wrong', (field, patch) => {
    const problems = entryProblems({ ...complete(), ...patch }) as string[]
    expect(problems.some((p) => p.startsWith(field))).toBe(true)
  })

  it('treats a legacy entry as incomplete', () => {
    const legacy = { ...complete(), legacy: { reason: 'sources lost', outputSha256: HELLO } }
    expect(entryProblems(legacy)).toContain(
      'legacy: not promotable until its source hash is pinned',
    )
  })
})

describe('verifySources (#202)', () => {
  it('passes when every source matches its pinned hash', () => {
    const dir = scratch()
    writeFileSync(join(dir, 'a.glb'), 'abc')
    expect(() => verifySources(complete(), dir)).not.toThrow()
  })

  it('throws when a source differs from its pinned hash', () => {
    const dir = scratch()
    writeFileSync(join(dir, 'a.glb'), 'changed')
    expect(() => verifySources(complete(), dir)).toThrow(/a\.glb.*sha256/)
  })

  it('throws when a source file is missing', () => {
    expect(() => verifySources(complete(), scratch())).toThrow(/a\.glb/)
  })
})

describe('promote (#202)', () => {
  function staged(bytes: number) {
    const staging = scratch()
    const out = scratch()
    writeFileSync(join(staging, 'm.glb'), Buffer.alloc(bytes))
    return { staging, out }
  }

  it('copies a complete entry that is within budget', () => {
    const { staging, out } = staged(100)
    promote('m', staging, out, complete(), 500_000, 9000)
    expect(readdirSync(out)).toEqual(['m.glb'])
  })

  it('refuses an incomplete entry and copies nothing', () => {
    const { staging, out } = staged(100)
    expect(() => promote('m', staging, out, { ...complete(), family: '' }, 500_000, 9000)).toThrow(
      /family/,
    )
    expect(readdirSync(out)).toEqual([])
  })

  it('refuses a legacy entry', () => {
    const { staging, out } = staged(100)
    const legacy = { ...complete(), legacy: { reason: 'lost', outputSha256: HELLO } }
    expect(() => promote('m', staging, out, legacy, 500_000, 9000)).toThrow(/legacy/)
    expect(readdirSync(out)).toEqual([])
  })

  it('refuses an output over the per-model budget', () => {
    const max = BUDGETS.craftModelBytes as number
    const { staging, out } = staged(max + 1)
    expect(() => promote('m', staging, out, complete(), max, 9000)).toThrow(
      new RegExp(`${max + 1} B is over`),
    )
    expect(readdirSync(out)).toEqual([])
  })

  it('allows a small overshoot of the triangle budget, and no more', () => {
    const ok = staged(10)
    const limit = Math.floor(9000 * TRIANGLE_TOLERANCE)
    promote('m', ok.staging, ok.out, complete(), 500_000, limit)
    expect(readdirSync(ok.out)).toEqual(['m.glb'])
    const over = staged(10)
    expect(() => promote('m', over.staging, over.out, complete(), 500_000, limit + 1)).toThrow(
      /triangles/,
    )
    expect(readdirSync(over.out)).toEqual([])
  })

  it('refuses when the staged triangle count is not given', () => {
    const { staging, out } = staged(10)
    expect(() => promote('m', staging, out, complete(), 500_000, undefined)).toThrow(/triangles/)
  })

  it('creates the destination folder when it is missing', () => {
    const { staging, out } = staged(10)
    const dest = join(out, 'nested')
    promote('m', staging, dest, complete(), 500_000, 9000)
    mkdirSync(dest, { recursive: true })
    expect(readdirSync(dest)).toEqual(['m.glb'])
  })
})

describe('assertSourceFiles (#202)', () => {
  it('passes when the build reads exactly the files the manifest pins', () => {
    const entry = {
      ...complete(),
      sources: [
        { file: 'b.stl', sha256: HELLO },
        { file: 'a.stl', sha256: HELLO },
      ],
    }
    expect(() => assertSourceFiles('m', entry, ['a.stl', 'b.stl'])).not.toThrow()
  })

  it('throws when the build reads a file the manifest does not pin', () => {
    expect(() => assertSourceFiles('m', complete(), ['a.glb', 'extra.stl'])).toThrow(/extra\.stl/)
  })

  it('throws when the manifest pins a file the build does not read', () => {
    expect(() => assertSourceFiles('m', complete(), [])).toThrow(/a\.glb/)
  })
})

describe('unknownModels (#202)', () => {
  it('names requested models that are not in the manifest', () => {
    expect(unknownModels(['a', 'zzz'], ['a', 'b'])).toEqual(['zzz'])
    expect(unknownModels([], ['a'])).toEqual([])
  })
})

describe('sha256Hex (#202)', () => {
  it('hashes bytes', () => {
    expect(sha256Hex(Buffer.from('abc'))).toBe(HELLO)
  })
})

function glb(json: unknown, bin: Buffer): Buffer {
  let text = Buffer.from(JSON.stringify(json), 'utf8')
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)])
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + text.length + 8 + bin.length, 8)
  const jsonHead = Buffer.alloc(8)
  jsonHead.writeUInt32LE(text.length, 0)
  jsonHead.writeUInt32LE(0x4e4f534a, 4)
  const binHead = Buffer.alloc(8)
  binHead.writeUInt32LE(bin.length, 0)
  binHead.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([header, jsonHead, text, binHead, bin])
}

function jsonOf(bytes: Uint8Array): Record<string, unknown> {
  const buf = Buffer.from(bytes)
  return JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'))
}

describe('glbWithoutExternalImages (#194)', () => {
  const bin = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])
  const source = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: 8 }],
    images: [{ uri: '..\\Terra.fbm\\solarpanels.tga' }],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{}],
    materials: [
      {
        name: 'panel',
        pbrMetallicRoughness: { baseColorTexture: { index: 0 }, baseColorFactor: [0, 0, 1, 1] },
        emissiveTexture: { index: 0 },
        emissiveFactor: [0, 0, 0.1],
      },
    ],
  }

  it('drops images, textures, samplers and texture references but keeps colours', () => {
    const out = glbWithoutExternalImages(glb(source, bin))
    const json = jsonOf(out)
    expect(json['images']).toBeUndefined()
    expect(json['textures']).toBeUndefined()
    expect(json['samplers']).toBeUndefined()
    expect(json['materials']).toEqual([
      {
        name: 'panel',
        pbrMetallicRoughness: { baseColorFactor: [0, 0, 1, 1] },
        emissiveFactor: [0, 0, 0.1],
      },
    ])
  })

  it('writes a well-formed GLB: lengths agree and the binary chunk is untouched', () => {
    const out = Buffer.from(glbWithoutExternalImages(glb(source, bin)))
    expect(out.readUInt32LE(8)).toBe(out.length)
    expect(out.readUInt32LE(12) % 4).toBe(0)
    expect(out.subarray(out.length - bin.length)).toEqual(bin)
  })

  it('refuses a file that embeds an image, so nothing is dropped silently', () => {
    const embedded = { ...source, images: [{ bufferView: 0, mimeType: 'image/png' }] }
    expect(() => glbWithoutExternalImages(glb(embedded, bin))).toThrow(/embeds an image/)
  })

  it('refuses bytes that are not a GLB', () => {
    expect(() => glbWithoutExternalImages(Buffer.from('not a glb at all, no'))).toThrow(/not a GLB/)
  })

  it('does not treat a data: URI as an external image', () => {
    const inline = { ...source, images: [{ uri: 'data:image/png;base64,iVBORw0KGgo=' }] }
    expect(() => glbWithoutExternalImages(glb(inline, bin))).toThrow(/embeds an image/)
  })

  it('clears texture references inside material extensions too', () => {
    const withExt = {
      ...source,
      materials: [
        {
          name: 'panel',
          extensions: {
            KHR_materials_specular: { specularTexture: { index: 0 }, specularFactor: 0.5 },
            KHR_materials_clearcoat: {
              clearcoatFactor: 1,
              clearcoatTexture: { index: 0 },
              clearcoatNormalTexture: { index: 0 },
            },
          },
        },
      ],
    }
    const json = jsonOf(glbWithoutExternalImages(glb(withExt, bin)))
    expect(json['materials']).toEqual([
      {
        name: 'panel',
        extensions: {
          KHR_materials_specular: { specularFactor: 0.5 },
          KHR_materials_clearcoat: { clearcoatFactor: 1 },
        },
      },
    ])
  })
})

describe('blankRegion (#194)', () => {
  // 6 x 4 RGBA picture, all (60, 60, 60, 255) except a bright 2 x 2 patch at x 2..3, y 1..2.
  const width = 6
  const height = 4
  const make = () => {
    const px = Buffer.alloc(width * height * 4, 60)
    for (let i = 3; i < px.length; i += 4) px[i] = 255
    for (const [x, y] of [
      [2, 1],
      [3, 1],
      [2, 2],
      [3, 2],
    ] as const) {
      const at = (y * width + x) * 4
      px[at] = 250
      px[at + 1] = 250
      px[at + 2] = 250
    }
    return px
  }
  const rect = { x: 2, y: 1, w: 2, h: 2 }

  it('paints the rectangle with the mean colour of the pixels around it', () => {
    const out = blankRegion(make(), width, height, 4, rect)
    for (const [x, y] of [
      [2, 1],
      [3, 1],
      [2, 2],
      [3, 2],
    ] as const) {
      const at = (y * width + x) * 4
      expect([out[at], out[at + 1], out[at + 2], out[at + 3]]).toEqual([60, 60, 60, 255])
    }
  })

  it('leaves every pixel outside the rectangle alone and does not change its input', () => {
    const input = make()
    const copy = Buffer.from(input)
    const out = blankRegion(input, width, height, 4, rect)
    expect(input).toEqual(copy)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const inside = x >= 2 && x <= 3 && y >= 1 && y <= 2
        if (!inside) {
          const at = (y * width + x) * 4
          expect(out.subarray(at, at + 4)).toEqual(copy.subarray(at, at + 4))
        }
      }
    }
  })

  it('refuses a rectangle that leaves the picture', () => {
    expect(() => blankRegion(make(), width, height, 4, { x: 5, y: 0, w: 2, h: 2 })).toThrow(
      /outside/,
    )
  })

  it('refuses a rectangle that covers the whole picture, which leaves no ring to sample', () => {
    expect(() =>
      blankRegion(make(), width, height, 4, { x: 0, y: 0, w: width, h: height }),
    ).toThrow(/ring/)
  })

  it('refuses a rectangle that reaches past the picture edge', () => {
    expect(() => blankRegion(make(), width, height, 4, { x: 4, y: 3, w: 3, h: 2 })).toThrow(
      /outside/,
    )
  })
})
