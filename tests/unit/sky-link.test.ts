/**
 * The sky view's shareable link (#99 item 5): `#sky?target=sbc:<SPK-ID>&t=<ISO UTC>`.
 * It must read back what it writes.
 */
import { describe, expect, it } from 'vitest'

import { parseSkyLink, serialiseSkyLink, targetOfTonightId } from '@/lib/sky/skyLink'

describe('parseSkyLink', () => {
  it('reads the target and the time', () => {
    expect(parseSkyLink('#sky?target=sbc:20000004&t=2026-11-14T22:00:00Z')).toEqual({
      target: 'sbc:20000004',
      t: Date.parse('2026-11-14T22:00:00Z'),
    })
  })

  it('reads a bare #sky, a percent-encoded colon and a slash after the hash', () => {
    expect(parseSkyLink('#sky')).toEqual({ target: null, t: null })
    expect(parseSkyLink('#/sky?target=sbc%3A20000004').target).toBe('sbc:20000004')
  })

  it.each([
    '#sky?target=sb:20000004',
    '#sky?target=sbc:',
    '#sky?target=sbc:abc',
    '#sky?target=sbc:1234567890123',
    '#sky?target=Mars',
    '#sky?target=%E0%A4%A',
  ])('ignores a target it does not understand: %j', (hash) => {
    expect(parseSkyLink(hash).target).toBeNull()
  })

  it('ignores a time it does not understand, and anything on another view', () => {
    expect(parseSkyLink('#sky?t=tomorrow').t).toBeNull()
    expect(parseSkyLink('#sky?t=2026-13-45T99:00:00Z').t).toBeNull()
    expect(parseSkyLink('#orrery?target=sbc:20000004&t=2026-11-14T22:00:00Z')).toEqual({
      target: null,
      t: null,
    })
  })
})

describe('serialiseSkyLink', () => {
  it('writes #sky alone, a target alone, or both, the time to the second', () => {
    expect(serialiseSkyLink({ target: null, t: null })).toBe('#sky')
    expect(serialiseSkyLink({ target: 'sbc:20000004', t: null })).toBe('#sky?target=sbc:20000004')
    expect(
      serialiseSkyLink({ target: 'sbc:20000004', t: Date.parse('2026-11-14T22:00:00.789Z') }),
    ).toBe('#sky?target=sbc:20000004&t=2026-11-14T22:00:00Z')
  })

  it('round-trips', () => {
    const link = { target: 'sbc:1004083', t: Date.parse('2026-11-14T22:00:00Z') }
    expect(parseSkyLink(serialiseSkyLink(link))).toEqual(link)
  })

  it('drops a time that has no target to apply to', () => {
    expect(serialiseSkyLink({ target: null, t: Date.parse('2026-11-14T22:00:00Z') })).toBe('#sky')
  })
})

describe('targetOfTonightId', () => {
  // The Tonight slice names objects `sb:<SPK-ID>`; the orrery keys the same objects
  // `sbc:<SPK-ID>` (`sb:` there means a close approach), and the sky link follows the orrery.
  it('turns a slice id into the orrery key', () => {
    expect(targetOfTonightId('sb:20000004')).toBe('sbc:20000004')
  })
  it('gives null for an id that is not a slice id', () => {
    expect(targetOfTonightId('Mars')).toBeNull()
    expect(targetOfTonightId('sb:')).toBeNull()
  })
})
