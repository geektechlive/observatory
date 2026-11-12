import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { SPACECRAFT } from '@/lib/orrery/craft'
import { attitudeDirection, CRAFT_MODELS, craftModelFor } from '@/lib/orrery/craftModels'
import { SATELLITE_MODELS_BY_FAMILY, SATELLITE_MODELS_BY_NORAD } from '@/lib/orrery/modelDescriptor'

// @ts-expect-error plain ESM script, no type declarations
import { BUDGETS } from '../../scripts/check-bundle.mjs'

const PUBLIC = resolve(__dirname, '../../public')
const MODEL_DIR = resolve(PUBLIC, 'models/craft')

/** The JSON chunk of a GLB (header 12 bytes, then chunk length, type 'JSON', data). */
function glbJson(path: string): { extensionsUsed?: string[]; extensionsRequired?: string[] } {
  const buf = readFileSync(path)
  const length = buf.readUInt32LE(12)
  return JSON.parse(buf.subarray(20, 20 + length).toString('utf8')) as {
    extensionsUsed?: string[]
  }
}

describe('spacecraft models (#115)', () => {
  it('gives every craft in the catalogue a model or a stand-in, with a silhouette', () => {
    for (const craft of SPACECRAFT) {
      const m = craftModelFor(craft.naifId)
      expect(m, craft.name).toBeDefined()
      expect(m?.silhouette.length, craft.name).toBeGreaterThan(0)
    }
  })

  it('credits NASA for each NASA model, with its page, and calls a stand-in a simplified model', () => {
    for (const m of Object.values(CRAFT_MODELS)) {
      if (m.kind === 'nasa') {
        expect(m.credit).toMatch(/^NASA/)
        expect(m.sourceUrl).toMatch(/^https:\/\//)
        expect(m.file).toMatch(/^\/models\/craft\/[a-z-]+\.glb$/)
      } else {
        expect(m.credit).toBe('Simplified model')
        expect(m.file).toBeNull()
      }
    }
  })

  it('points each model at a real glTF 2 binary (magic bytes, as the font lesson taught)', () => {
    const files = Object.values(CRAFT_MODELS)
      .map((m) => m.file)
      .filter((f): f is string => f !== null)
    expect(files.length).toBeGreaterThanOrEqual(9)
    for (const url of new Set(files)) {
      const head = readFileSync(resolve(PUBLIC, `.${url}`)).subarray(0, 8)
      expect(head.subarray(0, 4).toString('latin1'), url).toBe('glTF')
      expect(head.readUInt32LE(4), url).toBe(2)
    }
  })

  it('ships no model file the code does not use', () => {
    const used = new Set<string | null>([
      ...Object.values(CRAFT_MODELS).map((m) => m.file),
      ...Object.values(SATELLITE_MODELS_BY_NORAD).map((m) => m.file),
      ...Object.values(SATELLITE_MODELS_BY_FAMILY).map((m) => m.file),
    ])
    for (const file of readdirSync(MODEL_DIR)) {
      expect(used.has(`/models/craft/${file}`), file).toBe(true)
    }
  })

  // Draco and meshopt need a WebAssembly decoder, and the CSP allows no WebAssembly
  // compile; the build script decodes them, so the browser needs only GLTFLoader.
  it('needs no geometry decoder in the browser', () => {
    for (const file of readdirSync(MODEL_DIR)) {
      const used = glbJson(resolve(MODEL_DIR, file)).extensionsUsed ?? []
      expect(used, file).not.toContain('KHR_draco_mesh_compression')
      expect(used, file).not.toContain('EXT_meshopt_compression')
    }
  })

  // Seen only on the deployed preview (dev ignores _headers): GLTFLoader reads a model's
  // embedded textures by fetching blob: URLs, which connect-src refused, so Parker and
  // JWST drew untextured. A blob: URL is only ever made by the page itself.
  it('lets GLTFLoader fetch the blob: URLs of embedded textures under the CSP', () => {
    const headers = readFileSync(resolve(PUBLIC, '_headers'), 'utf8')
    const directive = (name: string) =>
      (new RegExp(`${name} ([^;]+);`).exec(headers)?.[1] ?? '').split(/\s+/)
    expect(directive('connect-src')).toContain('blob:')
    expect(directive('img-src')).toContain('blob:')
  })

  it('keeps every model within the per-model budget', () => {
    for (const file of readdirSync(MODEL_DIR)) {
      expect(readFileSync(resolve(MODEL_DIR, file)).length, file).toBeLessThanOrEqual(
        BUDGETS.craftModelBytes,
      )
    }
  })
})

describe('attitude (#115)', () => {
  const craft = { x: 3, y: 4, z: 0 }
  const earth = { x: 1, y: 0, z: 0 }

  it('points a Sun-facing axis at the Sun', () => {
    const d = attitudeDirection('sun', craft, earth)
    expect(d.x).toBeCloseTo(-0.6)
    expect(d.y).toBeCloseTo(-0.8)
    expect(d.z).toBeCloseTo(0)
  })

  it('points an Earth-facing axis at Earth', () => {
    const d = attitudeDirection('earth', craft, earth)
    const n = Math.hypot(2, 4)
    expect(d.x).toBeCloseTo(-2 / n)
    expect(d.y).toBeCloseTo(-4 / n)
  })

  it('points a spin axis at ecliptic north', () => {
    expect(attitudeDirection('ecliptic-north', craft, earth)).toEqual({ x: 0, y: 0, z: 1 })
  })

  it('gives Voyager its dish to Earth, Parker and JWST their shields to the Sun', () => {
    const voyager = craftModelFor('-31')
    expect(voyager?.attitude).toBe('earth')
    expect(voyager?.axis).toEqual([0, 1, 0]) // the dish faces the model's +Y
    expect(craftModelFor('-32')?.file).toBe(voyager?.file) // one design, both craft
    expect(craftModelFor('-96')?.attitude).toBe('sun')
    expect(craftModelFor('-96')?.axis).toEqual([0, 0, -1]) // Parker's heat shield is on -Z
    expect(craftModelFor('-170')?.attitude).toBe('sun')
    expect(craftModelFor('-170')?.axis).toEqual([0, -1, 0]) // JWST's sunshield side
  })
})
