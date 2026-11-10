import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// @ts-expect-error plain ESM script, no type declarations
import { BUDGETS } from '../../../scripts/check-bundle.mjs'
import {
  assertSourceFiles,
  entryProblems,
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
    const { staging, out } = staged(500_001)
    expect(() => promote('m', staging, out, complete(), BUDGETS.craftModelBytes, 9000)).toThrow(
      /500001/,
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
