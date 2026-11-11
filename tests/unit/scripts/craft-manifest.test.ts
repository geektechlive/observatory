import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CRAFT_MODELS } from '@/lib/orrery/craftModels'
import {
  type ModelDescriptor,
  SATELLITE_MODELS_BY_FAMILY,
  SATELLITE_MODELS_BY_NORAD,
  spacecraftDescriptor,
} from '@/lib/orrery/modelDescriptor'

// @ts-expect-error plain ESM script, no type declarations
import { entryProblems, sha256Hex } from '../../../scripts/craft-gate.mjs'
// @ts-expect-error plain ESM script, no type declarations
import { MANIFEST } from '../../../scripts/craft-manifest.mjs'
// @ts-expect-error plain ESM script, no type declarations
import { SOURCES } from '../../../scripts/craft-sources.mjs'

const SOURCES_BY_NAME = SOURCES as Record<string, Record<string, unknown>>

interface Entry {
  legacy?: { reason: string; outputSha256: string }
  [k: string]: unknown
}

const manifest = MANIFEST as Record<string, Entry>
const MODELS_DIR = join(__dirname, '..', '..', '..', 'public', 'models')
const SHIPPED_DIR = join(MODELS_DIR, 'craft')

/** Every file under public/models/, of any kind, as a path relative to it. */
function allFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? allFiles(join(dir, e.name)) : [relative(MODELS_DIR, join(dir, e.name))],
  )
}

const everything = allFiles(MODELS_DIR)
/** Only `craft/<name>.glb` (any letter case) can have a manifest entry. */
const GLB = /^craft\/(.+)\.glb$/i
const shipped = everything.filter((f) => GLB.test(f)).map((f) => f.slice('craft/'.length))

/**
 * The models that shipped before the gate existed (#115). Their source downloads are not
 * kept, so their source hash, version and logo check are unrecorded; the gate pins the
 * shipped bytes instead. This list never grows: a new model needs a complete entry.
 */
const LEGACY = [
  'ace',
  'clipper',
  'dscovr',
  'juno',
  'jwst',
  'new-horizons',
  'parker',
  'soho',
  'voyager',
  'wind',
]

describe('craft model manifest (#202)', () => {
  it('lists the shipped models', () => {
    expect(shipped.length).toBeGreaterThan(0)
  })

  it('finds no file under public/models/ the manifest cannot cover', () => {
    // A stray extension, a nested folder or a differently cased name would ship unchecked.
    const strays = everything.filter((f) => !/^craft\/[^/]+\.glb$/.test(f))
    expect(strays).toEqual([])
  })

  it.each(shipped)('%s has a complete manifest entry, or a pinned legacy one', (file) => {
    const name = file.replace(/\.glb$/i, '')
    const entry = manifest[name]
    expect(entry, `${name} has no manifest entry`).toBeDefined()
    if (!entry) return
    if (entry.legacy) {
      expect(LEGACY, `${name} is not a pre-gate model`).toContain(name)
      expect(entry.legacy.reason.length).toBeGreaterThan(0)
      expect(sha256Hex(readFileSync(join(SHIPPED_DIR, file)))).toBe(entry.legacy.outputSha256)
    } else {
      expect(entryProblems(entry)).toEqual([])
      // A rebuild changes the bytes: the manifest must be updated on purpose (the build prints
      // the new hash).
      expect(entry['outputSha256'], `${name} has no pinned outputSha256`).toMatch(/^[0-9a-f]{64}$/)
      expect(sha256Hex(readFileSync(join(SHIPPED_DIR, file)))).toBe(entry['outputSha256'])
    }
  })

  it('records every build-time edit in the manifest, the same as SOURCES holds it', () => {
    // blank, dropNodes, dropExternalImages, aim and the rest: a change in SOURCES alone would
    // ship a different file under the same logo record.
    for (const [name, entry] of Object.entries(manifest)) {
      if (entry.legacy) continue
      expect(
        SOURCES_BY_NAME[name] ?? {},
        `${name}: SOURCES and manifest transforms differ`,
      ).toEqual(entry['transforms'] ?? {})
    }
    for (const name of Object.keys(SOURCES_BY_NAME)) {
      expect(manifest[name], `${name} is in SOURCES but not the manifest`).toBeDefined()
    }
  })

  it('has no entry for a model that is not shipped', () => {
    const names = shipped.map((f) => f.replace(/\.glb$/i, ''))
    for (const name of Object.keys(manifest)) expect(names).toContain(name)
  })

  it('records a licence, evidence and credit page for every legacy model', () => {
    for (const [name, entry] of Object.entries(manifest)) {
      expect(entry['licence'], name).toBeTruthy()
      expect(entry['sourceUrl'], name).toBeTruthy()
      expect(entry['family'], name).toBeTruthy()
      expect(entry['triangles'], name).toBeGreaterThan(0)
    }
  })
})

describe('descriptors and the manifest (#202)', () => {
  const descriptors: ModelDescriptor[] = [
    ...Object.keys(CRAFT_MODELS).map((id) => spacecraftDescriptor(id)),
    ...Object.values(SATELLITE_MODELS_BY_NORAD),
    ...Object.values(SATELLITE_MODELS_BY_FAMILY),
  ].filter((d): d is ModelDescriptor => d !== undefined)

  it('gives every descriptor file a manifest entry', () => {
    const files = descriptors.flatMap((d) => (d.kind === 'file' ? [d.file] : []))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const match = /^\/models\/craft\/(.+)\.glb$/.exec(file)
      expect(match, `${file} is not under /models/craft/`).not.toBeNull()
      expect(manifest[match?.[1] ?? ''], `${file} has no manifest entry`).toBeDefined()
    }
  })
})
