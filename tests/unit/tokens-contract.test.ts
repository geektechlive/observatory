/**
 * tokens.css contract (ROCI v2, #37).
 *
 * Every ink token must be an opaque oklch() literal that clears WCAG AA (4.5:1)
 * on each surface it sits on. v1's --bone-faint was alpha 0.40 and measured 3.25:1,
 * failing about 93 text uses; alpha ink can't be measured once glass is involved,
 * so text ink is solid by rule.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { contrastRatio, oklchToHex, parseOklch } from '@/lib/color'

const css = readFileSync(resolve(__dirname, '../../src/styles/tokens.css'), 'utf8')
const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')))

const token = (name: string): string | undefined =>
  new RegExp(`${name}:\\s*([^;]+);`).exec(root)?.[1]?.trim()

const SURFACES = ['--void', '--hull', '--hull-2'] as const
const INK = [
  '--bone',
  '--bone-dim',
  '--bone-faint',
  '--copper',
  '--copper-glow',
  '--signal',
  '--terminal',
  '--amber',
  '--mcrn',
] as const
const MARK_ONLY = ['--copper-2', '--mcrn-2'] as const

const hexOf = (name: string): string => {
  const value = token(name)
  const parsed = value ? parseOklch(value) : null
  if (!parsed) throw new Error(`${name} is not an oklch() literal: ${value ?? 'missing'}`)
  return oklchToHex(parsed)
}

describe('tokens.css ink contract', () => {
  it.each(INK)('%s is an opaque oklch literal', (name) => {
    const parsed = parseOklch(token(name) ?? '')
    expect(parsed, `${name} must be a literal oklch()`).not.toBeNull()
    expect(parsed?.alpha, `${name} must not use alpha`).toBe(1)
  })

  it.each(INK.flatMap((ink) => SURFACES.map((s) => [ink, s] as const)))(
    '%s on %s clears 4.5:1',
    (ink, surface) => {
      expect(contrastRatio(hexOf(ink), hexOf(surface))).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each(MARK_ONLY)('%s is labelled MARK-ONLY next to its declaration', (name) => {
    const line = root.split('\n').find((l) => l.includes(`${name}:`)) ?? ''
    expect(line).toMatch(/MARK-ONLY/)
  })
})

describe('tokens.css scales', () => {
  it.each([
    '--space-1',
    '--space-7',
    '--radius',
    '--z-overlay',
    '--z-modal',
    '--track-engrave',
    '--ease-settle',
    '--scrim',
  ])('defines %s', (name) => {
    expect(token(name)).toBeDefined()
  })

  it('defines the globe grade the shader reads', () => {
    for (const name of [
      '--globe-grade-shadow',
      '--globe-grade-deep',
      '--globe-grade-mid',
      '--globe-grade-high',
      '--globe-grade-mix',
      '--globe-night',
    ]) {
      expect(token(name), name).toBeDefined()
    }
  })

  it('ships one global reduced-motion block', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })
})
