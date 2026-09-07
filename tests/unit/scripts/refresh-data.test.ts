import { describe, expect, it } from 'vitest'

// @ts-expect-error plain ESM script, no type declarations
import { isValidLaunchesPayload, parseTle, tleChecksumOk } from '../../../scripts/refresh-data.mjs'

// Real ISS TLE fetched from CelesTrak on 2026-09-07.
const LINE1 = '1 25544U 98067A   26250.17589239  .00004561  00000+0  90859-4 0  9999'
const LINE2 = '2 25544  51.6308 254.3052 0005020 115.4261 244.7248 15.49013499584466'
const NAME = 'ISS (ZARYA)'

// CelesTrak pads the name line out to 24 characters.
const TLE_TEXT = `${NAME.padEnd(24)}\n${LINE1}\n${LINE2}\n`

/** Flip one digit so the checksum no longer matches, keeping the 69-char length. */
function corrupt(line: string): string {
  const digit = Number(line[20])
  return `${line.slice(0, 20)}${(digit + 1) % 10}${line.slice(21)}`
}

describe('tleChecksumOk', () => {
  it('accepts both lines of a real ISS TLE', () => {
    expect(tleChecksumOk(LINE1)).toBe(true)
    expect(tleChecksumOk(LINE2)).toBe(true)
  })

  it('rejects a line with a corrupted digit', () => {
    const bad = corrupt(LINE1)
    expect(bad).not.toBe(LINE1)
    expect(bad.length).toBe(69)
    expect(tleChecksumOk(bad)).toBe(false)
  })

  it('rejects lines of the wrong length and non-strings', () => {
    expect(tleChecksumOk(LINE1.slice(0, 68))).toBe(false)
    expect(tleChecksumOk(`${LINE1} `)).toBe(false)
    expect(tleChecksumOk(undefined)).toBe(false)
    expect(tleChecksumOk(12345)).toBe(false)
  })
})

describe('parseTle', () => {
  it('parses a real CelesTrak block and trims the padded name', () => {
    expect(parseTle(TLE_TEXT)).toEqual({ name: NAME, line1: LINE1, line2: LINE2 })
  })

  it('rejects a block whose checksum is corrupted', () => {
    expect(parseTle(`${NAME}\n${corrupt(LINE1)}\n${LINE2}`)).toBeNull()
  })

  it('rejects a block with the wrong number of lines', () => {
    expect(parseTle(`${NAME}\n${LINE1}`)).toBeNull()
    expect(parseTle(`${NAME}\n${LINE1}\n${LINE2}\n${LINE2}`)).toBeNull()
  })

  it('rejects swapped or mislabelled lines', () => {
    expect(parseTle(`${NAME}\n${LINE2}\n${LINE1}`)).toBeNull()
  })

  it('rejects lines that are not 69 characters', () => {
    expect(parseTle(`${NAME}\n${LINE1.slice(0, 68)}\n${LINE2}`)).toBeNull()
  })

  it('rejects an empty name line and non-string input', () => {
    expect(parseTle(`\n${LINE1}\n${LINE2}`)).toBeNull()
    expect(parseTle(null)).toBeNull()
  })
})

describe('isValidLaunchesPayload', () => {
  it('accepts a RocketLaunch.live shaped payload', () => {
    expect(isValidLaunchesPayload({ valid_auth: true, count: 1, result: [{ id: 1 }] })).toBe(true)
  })

  it('rejects payloads missing result or count', () => {
    expect(isValidLaunchesPayload({ count: 1 })).toBe(false)
    expect(isValidLaunchesPayload({ result: [] })).toBe(false)
    expect(isValidLaunchesPayload(null)).toBe(false)
    expect(isValidLaunchesPayload('nope')).toBe(false)
  })
})
