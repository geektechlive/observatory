import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// @ts-expect-error plain ESM script, no type declarations
import { checkBundle } from '../../../scripts/check-bundle.mjs'

interface Finding {
  ok: boolean
  rule: string
  detail: string
}

const BUDGETS = {
  orreryGuideGzip: 4_000,
  entryGzip: 40_000,
  lazyThreeGzip: 4_000,
  worldMapGzip: 4_000,
  orreryGzip: 4_000,
  textureBytes: 2_000,
}

/** A fake dist/ with an index.html that loads `entry` and modulepreloads `preloads`. */
function fakeDist(files: Record<string, string>, entry: string, preloads: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-graph-'))
  mkdirSync(join(dir, 'assets'))
  writeFileSync(
    join(dir, 'index.html'),
    `<script type="module" crossorigin src="/assets/${entry}"></script>` +
      preloads.map((p) => `<link rel="modulepreload" crossorigin href="/assets/${p}">`).join(''),
  )
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, 'assets', name), body)
  return dir
}

const failures = (findings: Finding[]) => findings.filter((f) => !f.ok).map((f) => f.rule)
const rule = (findings: Finding[], name: string) => findings.find((f) => f.rule === name)

// #155: what costs time on HTTP/2 is a chain, where one file must arrive and run before
// the next is even requested. Every file the entry reaches through static imports must
// be named in index.html's modulepreload list, so the browser asks for them all at once.
describe('checkBundle first-load graph (#155)', () => {
  it('passes when every statically imported file is preloaded, transitively', () => {
    const dir = fakeDist(
      {
        'index-abc.js': 'import{a as e}from"./a-1.js";import"./b-2.js";export{e}',
        'a-1.js': 'import{c as t}from"./c-3.js";export{t as a}',
        'b-2.js': 'export{}',
        'c-3.js': 'export{}',
      },
      'index-abc.js',
      ['a-1.js', 'b-2.js', 'c-3.js'],
    )
    const findings = checkBundle(dir, BUDGETS) as Finding[]
    expect(failures(findings)).toEqual([])
    expect(rule(findings, 'first-load-no-chain')?.ok).toBe(true)
  })

  it('reads spaced imports as well as minified ones', () => {
    const dir = fakeDist(
      {
        'index-abc.js': 'import { a } from "./a-1.js"\nimport "./b-2.js"',
        'a-1.js': 'x',
        'b-2.js': 'x',
      },
      'index-abc.js',
      ['a-1.js'],
    )
    const findings = checkBundle(dir, BUDGETS) as Finding[]
    expect(failures(findings)).toEqual(['first-load-no-chain'])
    expect(rule(findings, 'first-load-no-chain')?.detail).toContain('b-2.js')
  })

  it('fails when a file in the static graph is missing from the preload list', () => {
    const dir = fakeDist(
      {
        'index-abc.js': 'import{a as e}from"./a-1.js";export{e}',
        'a-1.js': 'import{c as t}from"./c-3.js";export{t as a}',
        'c-3.js': 'export{}',
      },
      'index-abc.js',
      ['a-1.js'],
    )
    const findings = checkBundle(dir, BUDGETS) as Finding[]
    expect(failures(findings)).toEqual(['first-load-no-chain'])
    expect(rule(findings, 'first-load-no-chain')?.detail).toContain('c-3.js')
  })

  it('does not follow dynamic imports or count them as a chain', () => {
    const dir = fakeDist(
      {
        'index-abc.js': 'const p=()=>import("./lazy-9.js");export{p}',
        'lazy-9.js': 'import"./deeper-8.js"',
        'deeper-8.js': 'export{}',
      },
      'index-abc.js',
      [],
    )
    expect(failures(checkBundle(dir, BUDGETS))).toEqual([])
  })

  it('reads re-exports as static imports', () => {
    const dir = fakeDist(
      { 'index-abc.js': 'export{x}from"./re-4.js"', 're-4.js': 'export const x=1' },
      'index-abc.js',
      [],
    )
    expect(failures(checkBundle(dir, BUDGETS))).toEqual(['first-load-no-chain'])
  })

  it('reports the first-load file count and fails above the ceiling of 8', () => {
    const names = Array.from({ length: 8 }, (_, i) => `p${i}-x.js`)
    const files: Record<string, string> = {
      'index-abc.js': names.map((n) => `import"./${n}";`).join(''),
    }
    for (const n of names) files[n] = 'export{}'
    const nine = fakeDist(files, 'index-abc.js', names)
    const findings = checkBundle(nine, BUDGETS) as Finding[]
    expect(rule(findings, 'first-load-files')?.detail).toContain('9 files')
    expect(failures(findings)).toEqual(['first-load-files'])

    const eight = fakeDist(
      {
        ...files,
        'index-abc.js': names
          .slice(0, 7)
          .map((n) => `import"./${n}";`)
          .join(''),
      },
      'index-abc.js',
      names.slice(0, 7),
    )
    const ok = checkBundle(eight, BUDGETS) as Finding[]
    expect(failures(ok)).toEqual([])
    expect(rule(ok, 'first-load-files')?.detail).toContain('8 files')
  })
})
