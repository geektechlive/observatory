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
  entryGzip: 4_000,
  lazyThreeGzip: 4_000,
  worldMapGzip: 4_000,
  orreryGzip: 4_000,
  textureBytes: 2_000,
}

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
  // #91: the orrery is a whole page behind its tab; none of it belongs in the first load.
  it('fails when the orrery lands in the first load', () => {
    const dir = fakeDist(
      { 'assets/index-abc.js': 'x', 'assets/shared-1.js': 'canvas.dataset.orreryWebgl=""' },
      'index-abc.js',
      ['shared-1.js'],
    )
    expect(failures(checkBundle(dir, BUDGETS))).toContain('entry-has-no-orrery')
  })

  it('budgets each lazy orrery chunk', () => {
    const noise = Array.from({ length: 20_000 }, (_, i) =>
      ((i * 2654435761) % 4093).toString(36),
    ).join('')
    const dir = fakeDist({
      'assets/index-abc.js': 'x',
      'assets/OrreryPage-zz.js': `data-orrery-page ${noise}`,
      'assets/OrreryRenderer-yy.js': 'small',
    })
    const findings = checkBundle(dir, BUDGETS) as Finding[]
    expect(failures(findings)).toEqual(['orrery-gzip'])
    expect(findings.filter((f) => f.rule === 'orrery-gzip')).toHaveLength(2)
  })

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

  // #97: satellite.js 7 in the first load cost ~5 kB gzip and split it into 18 chunks.
  it('fails when satellite.js lands in the entry or a chunk it preloads', () => {
    const sgp4 = 'var e={Decayed:6,SemiLatusRectumBelowZero:4}'
    const inEntry = fakeDist({ 'assets/index-abc.js': sgp4 })
    expect(failures(checkBundle(inEntry, BUDGETS))).toContain('entry-has-no-sgp4')
    const preloaded = fakeDist(
      { 'assets/index-abc.js': 'x', 'assets/dist-x.js': sgp4 },
      'index-abc.js',
      ['dist-x.js'],
    )
    expect(failures(checkBundle(preloaded, BUDGETS))).toContain('entry-has-no-sgp4')
  })

  it('accepts satellite.js in a lazy chunk', () => {
    const dir = fakeDist({
      'assets/index-abc.js': 'import("./propagate-x.js")',
      'assets/propagate-x.js': 'var e={SemiLatusRectumBelowZero:4}',
    })
    expect(failures(checkBundle(dir, BUDGETS))).toEqual([])
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

  // #105: the orrery's planet maps load with its tab. Each is budgeted, the set has a
  // total, and none may be preloaded with the page.
  describe('planet textures', () => {
    const planets = (files: Record<string, string>, html = '') => {
      const dir = fakeDist({ 'assets/index-abc.js': 'x' })
      mkdirSync(join(dir, 'textures', 'planets'))
      for (const [name, body] of Object.entries(files)) {
        writeFileSync(join(dir, 'textures', 'planets', name), body)
      }
      if (html)
        writeFileSync(
          join(dir, 'index.html'),
          `<script type="module" src="/assets/index-abc.js"></script>${html}`,
        )
      return dir
    }
    const budgets = { ...BUDGETS, planetTextureTotal: 3_000 }

    it('passes small maps', () => {
      const dir = planets({ 'mars.webp': 'x'.repeat(1_000), 'saturn.webp': 'x'.repeat(1_000) })
      const findings = checkBundle(dir, budgets) as Finding[]
      expect(failures(findings)).toEqual([])
      expect(findings.filter((f) => f.rule === 'planet-texture-bytes')).toHaveLength(2)
    })

    it('fails one oversized map', () => {
      const dir = planets({ 'jupiter.webp': 'x'.repeat(2_500) })
      expect(failures(checkBundle(dir, budgets))).toContain('planet-texture-bytes')
    })

    it('fails when the set is over its total', () => {
      const dir = planets({
        'a.webp': 'x'.repeat(1_500),
        'b.webp': 'x'.repeat(1_500),
        'c.webp': 'x'.repeat(1_500),
      })
      expect(failures(checkBundle(dir, budgets))).toEqual(['planet-texture-total'])
    })

    it('fails when the page preloads a planet map', () => {
      const dir = planets(
        { 'mars.webp': 'x' },
        '<link rel="preload" as="image" href="/textures/planets/mars.webp">',
      )
      expect(failures(checkBundle(dir, budgets))).toContain('entry-has-no-planet-textures')
    })
  })

  it('fails loudly when index.html names no module script', () => {
    const dir = fakeDist({ 'assets/index-abc.js': 'x' })
    writeFileSync(join(dir, 'index.html'), '<html></html>')
    expect(failures(checkBundle(dir, BUDGETS))).toContain('entry-found')
  })

  // #98: the satellite worker and its catalogue load with the orrery's satellite layer.
  describe('satellites', () => {
    const budgets = { ...BUDGETS, satWorkerGzip: 4_000 }
    const noise = Array.from({ length: 20_000 }, (_, i) =>
      ((i * 2654435761) % 4093).toString(36),
    ).join('')

    it('budgets the built satellite worker', () => {
      const big = fakeDist({ 'assets/index-abc.js': 'x', 'assets/sats.worker-q1.js': noise })
      expect(failures(checkBundle(big, budgets))).toEqual(['sat-worker-gzip'])
      const small = fakeDist({ 'assets/index-abc.js': 'x', 'assets/sats.worker-q1.js': 'w' })
      const findings = checkBundle(small, budgets) as Finding[]
      expect(failures(findings)).toEqual([])
      expect(findings.some((f) => f.rule === 'sat-worker-gzip')).toBe(true)
    })

    it('fails when the worker client or the catalogue reaches the first load', () => {
      for (const body of [
        'new Worker(new URL("/assets/sats.worker-q1.js", import.meta.url))',
        'const g = ["cosmos-2251-debris","fengyun-1c-debris"]',
      ]) {
        const dir = fakeDist(
          { 'assets/index-abc.js': 'x', 'assets/shared-1.js': body },
          'index-abc.js',
          ['shared-1.js'],
        )
        expect(failures(checkBundle(dir, budgets))).toContain('entry-has-no-sat-worker')
      }
    })
  })
})
