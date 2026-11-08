import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// #162: Rolldown places each module by the exact set of entries (the page and every lazy
// chunk) that import it. A new lazy chunk using only part of what the page shares, say
// JSX but no hook, split that shared code into extra first-load files. The two groups in
// vite.config.ts pin everything the entry imports statically into `vendor` and the
// entry's own chunk, whatever the lazy chunks use. check-bundle.mjs sees a regression
// only past 8 files, so this pins the config itself.
describe('vite.config.ts chunking', () => {
  const config = readFileSync(resolve(import.meta.dirname, '../../vite.config.ts'), 'utf8')

  it('keeps the first load in the vendor and app groups (#162)', () => {
    expect(config).toContain('codeSplitting')
    expect(config).toMatch(/name: 'vendor'[^}]*tags: \['\$initial'\]/)
    expect(config).toMatch(/name: 'app'[^}]*tags: \['\$initial'\]/)
  })
})
