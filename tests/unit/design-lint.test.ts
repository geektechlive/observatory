/**
 * Colour-literal and type-floor lint (ROCI v2 rules 4 and 6, #40).
 *
 * A hex/rgba ban alone misses oklch(), rgb(), hsl(), named colours and TSX strings
 * (Codex finding 7). The rules switch on directory by directory as each surface is
 * reskinned (design-lint.json), so the gate never goes red mid-redesign.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { ESLint } from 'eslint'
import stylelint from 'stylelint'
import { beforeAll, describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../..')
const designLint = JSON.parse(readFileSync(resolve(root, 'design-lint.json'), 'utf8')) as {
  enforced: string[]
  exempt: string[]
}

const DESIGN_RULES = new Set([
  'color-no-hex',
  'color-named',
  'function-disallowed-list',
  'declaration-property-value-disallowed-list',
])

async function cssErrors(code: string, file: string): Promise<string[]> {
  const result = await stylelint.lint({
    code,
    codeFilename: resolve(root, file),
    configFile: resolve(root, 'stylelint.config.js'),
  })
  return (result.results[0]?.warnings ?? []).map((w) => w.rule).filter((r) => DESIGN_RULES.has(r))
}

const eslint = new ESLint({ cwd: root })

// The first typed lint builds the TS program, about 6 s under `pnpm verify`'s parallel
// load. Pay it once here, so it doesn't time out whichever test happens to run first.
beforeAll(async () => {
  await eslint.lintText('export {}\n', { filePath: resolve(root, ENFORCED_TS) })
}, 60_000)

async function tsMessages(code: string, file: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: resolve(root, file) })
  const parseError = result?.messages.find((m) => m.fatal)
  if (parseError) throw new Error(parseError.message)
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === 'no-restricted-syntax')
    .map((m) => m.message)
}

const ENFORCED_CSS = 'src/components/ui/__probe__.module.css'
// Typed linting only resolves files the TS project knows, so lint probe text as an
// existing enforced file; the colour rule is purely syntactic.
const ENFORCED_TS = 'src/components/ui/Swatch.tsx'
// A path that is in no `enforced` glob. Every directory under src is enforced since Phase 3
// landed (#52 to #58), so the probe lives outside src.
const UNENFORCED_CSS = 'scripts/__not-listed__/__probe__.module.css'

describe('design-lint.json', () => {
  it('enforces at least the primitives and exempts the token sources', () => {
    expect(designLint.enforced).toContain('src/components/ui/**')
    expect(designLint.exempt).toEqual(
      expect.arrayContaining(['src/styles/tokens.css', 'src/lib/palette.ts']),
    )
  })
})

describe('stylelint colour literals', () => {
  it.each([
    ['hex', '.a { color: #ff0000; }'],
    ['rgba()', '.a { color: rgba(0, 0, 0, 0.5); }'],
    ['oklch()', '.a { color: oklch(0.6 0.1 40); }'],
    ['hsl()', '.a { color: hsl(10 50% 50%); }'],
    ['named colour', '.a { color: red; }'],
  ])('rejects a %s in an enforced directory', async (_name, code) => {
    expect((await cssErrors(code, ENFORCED_CSS)).length).toBeGreaterThan(0)
  })

  it('allows tokens, color-mix over tokens, transparent and currentColor', async () => {
    const code =
      '.a { color: var(--bone); background: color-mix(in oklch, var(--copper) 20%, transparent); border-color: currentcolor; }'
    expect(await cssErrors(code, ENFORCED_CSS)).toEqual([])
  })

  it('leaves a directory that is not listed alone', async () => {
    expect(await cssErrors('.a { color: #ff0000; }', UNENFORCED_CSS)).toEqual([])
  })
})

describe('stylelint type floor (11px)', () => {
  it.each(['9px', '10px', '0.6rem', '0.58rem'])('rejects font-size %s', async (size) => {
    expect((await cssErrors(`.a { font-size: ${size}; }`, ENFORCED_CSS)).length).toBeGreaterThan(0)
  })

  it.each(['11px', '0.6875rem', 'var(--text-xs)', '0.72em'])(
    'allows font-size %s',
    async (size) => {
      expect(await cssErrors(`.a { font-size: ${size}; }`, ENFORCED_CSS)).toEqual([])
    },
  )
})

describe('eslint colour literals in TS/TSX', () => {
  it.each([
    ["const c = '#ff3b30'"],
    ["const c = 'rgba(255,255,255,0.3)'"],
    ["const c = 'oklch(0.62 0.13 48)'"],
    ['const c = `oklch(0.62 0.13 ${48})`'],
  ])('rejects %s in an enforced file', async (code) => {
    expect((await tsMessages(`export ${code}\n`, ENFORCED_TS)).length).toBeGreaterThan(0)
  })

  it('allows var() strings and ordinary text', async () => {
    expect(
      await tsMessages("export const a = 'var(--bone)'\nexport const b = 'Sea #1'\n", ENFORCED_TS),
    ).toEqual([])
  })
})
