import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { dirname, join, relative } from 'path'
import { describe, expect, it } from 'vitest'

/**
 * CLAUDE.md is read on every turn of an AI coding session and by every agent it starts, so it
 * holds rules and pointers only; details, measurements and history live in docs/ (#170,
 * docs/decisions/0015-claude-md-holds-rules-docs-hold-the-rest.md). It once grew to 95 KB.
 */

const ROOT = join(__dirname, '..', '..')
const MAX_BYTES = 20 * 1024

/** The owner's private planning spec sits untracked in docs/ and is not ours to check. */
const IGNORED = new Set(['ORREY-CLAUDE-CODE-IMPLEMENTATION-SPECIFICATION.md'])

function markdownUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (IGNORED.has(name)) return []
    if (statSync(path).isDirectory()) return markdownUnder(path)
    return name.endsWith('.md') ? [path] : []
  })
}

/** Relative link targets in a markdown file, without their #anchor. */
function relativeLinks(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => (m[1] ?? '').split('#')[0] ?? '')
    .filter((target) => target !== '' && !/^[a-z]+:/i.test(target))
}

describe('CLAUDE.md (#170)', () => {
  it('stays under 20 KB', () => {
    const bytes = Buffer.byteLength(readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8'))
    expect(bytes, 'move details to docs/ and leave a one-line pointer').toBeLessThanOrEqual(
      MAX_BYTES,
    )
  })

  it('points only at files that exist, as do the docs it points to', () => {
    const files = [join(ROOT, 'CLAUDE.md'), ...markdownUnder(join(ROOT, 'docs'))]
    const broken = files.flatMap((file) =>
      relativeLinks(readFileSync(file, 'utf8'))
        .filter((target) => !existsSync(join(dirname(file), target)))
        .map((target) => `${relative(ROOT, file)} -> ${target}`),
    )
    expect(broken).toEqual([])
  })
})
