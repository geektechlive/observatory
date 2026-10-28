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

const BUDGETS = { entryGzip: 4_000, lazyThreeGzip: 4_000, worldMapGzip: 4_000, textureBytes: 2_000 }

/** A fake dist/ with an index.html that loads `entry` and modulepreloads `preloads`. */
function fakeDist(
  files: Record<string, string>,
  entry = 'index-abc.js',
  preloads: string[] = [],
): string {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-'))
  mkdirSync(join(dir, 'assets'))
  mkdirSync(join(dir, 'textures'))
  writeFileSync(
    join(dir, 'index.html'),
    `<script type="module" crossorigin src="/assets/${entry}"></script>` +
      preloads.map((p) => `<link rel="modulepreload" crossorigin href="/assets/${p}">`).join(''),
  )
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body)
  return dir
}

const failures = (findings: Finding[]) => findings.filter((f) => !f.ok).map((f) => f.rule)

describe('checkBundle', () => {
  it('passes a small entry chunk with no three.js in it', () => {
    const dir = fakeDist({ 'assets/index-abc.js': 'console.log("app")' })
    expect(failures(checkBundle(dir, BUDGETS))).toEqual([])
  })

  it('fails when three.js lands in the entry chunk (the spike regression)', () => {
    const dir = fakeDist({ 'assets/index-abc.js': 'class WebGLRenderer {}' })
    expect(failures(checkBundle(dir, BUDGETS))).toContain('entry-has-no-three')
  })

  it('fails an entry chunk over its gzip budget', () => {
    // incompressible-ish content so gzip stays large
    const noise = Array.from({ length: 20_000 }, (_, i) =>
      ((i * 2654435761) % 4093).toString(36),
    ).join('')
    const dir = fakeDist({ 'assets/index-abc.js': noise })
    expect(failures(checkBundle(dir, BUDGETS))).toContain('entry-gzip')
  })

  // #75: lazy-loading the console Rest panels split the code they share with the entry
  // into a "quota" chunk the entry imports statically. Measuring only the entry file
  // read 140.8 kB while first paint still loaded 180 kB.
  it('counts the chunks the entry imports statically (modulepreload) as first-load weight', () => {
    const noise = Array.from({ length: 20_000 }, (_, i) =>
      ((i * 2654435761) % 4093).toString(36),
    ).join('')
    const dir = fakeDist(
      { 'assets/index-abc.js': 'import "./shared-x.js"', 'assets/shared-x.js': noise },
      'index-abc.js',
      ['shared-x.js'],
    )
    const findings = checkBundle(dir, BUDGETS) as Finding[]
    expect(failures(findings)).toContain('entry-gzip')
    expect(findings.find((f) => f.rule === 'entry-gzip')?.detail).toContain('shared-x.js')
  })

  it('fails when three.js lands in a chunk the entry preloads', () => {
    const dir = fakeDist(
      { 'assets/index-abc.js': 'x', 'assets/shared-x.js': 'class WebGLRenderer {}' },
      'index-abc.js',
      ['shared-x.js'],
    )
    expect(failures(checkBundle(dir, BUDGETS))).toContain('entry-has-no-three')
  })

  it('does not count a lazy chunk the entry only imports dynamically', () => {
    const noise = Array.from({ length: 20_000 }, (_, i) =>
      ((i * 2654435761) % 4093).toString(36),
    ).join('')
    const dir = fakeDist({
      'assets/index-abc.js': 'import("./SkyConsoleRest-x.js")',
      'assets/SkyConsoleRest-x.js': noise,
    })
    expect(failures(checkBundle(dir, BUDGETS))).toEqual([])
  })

  it('budgets the lazy three.js chunk separately and allows it outside the entry', () => {
    const dir = fakeDist({
      'assets/index-abc.js': 'import("./GlobeRenderer-x.js")',
      'assets/GlobeRenderer-x.js': 'class WebGLRenderer {}',
    })
    const findings = checkBundle(dir, BUDGETS) as Finding[]
    expect(failures(findings)).toEqual([])
    expect(findings.find((f) => f.rule === 'lazy-three-gzip')?.ok).toBe(true)
  })

  it('fails an oversized texture', () => {
    const dir = fakeDist({
      'assets/index-abc.js': 'x',
      'textures/day-4096.webp': 'x'.repeat(3_000),
    })
    expect(failures(checkBundle(dir, BUDGETS))).toContain('texture-bytes')
  })

  it('fails loudly when index.html names no module script', () => {
    const dir = fakeDist({ 'assets/index-abc.js': 'x' })
    writeFileSync(join(dir, 'index.html'), '<html></html>')
    expect(failures(checkBundle(dir, BUDGETS))).toContain('entry-found')
  })
})
