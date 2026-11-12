/**
 * The orrery's Data sources list (#207): only the providers the orrery uses, each with one
 * plain sentence for visitors and the credit its terms require. The full registry, with
 * statuses, terms and the unused providers, lives in docs/reference/orrery-data.md.
 */
import { describe, expect, it } from 'vitest'

import { SOURCES } from '@/lib/orrery/sources'

/** What the orrery fetches, checked against the code in #207. Adding one is deliberate. */
const USED = [
  'cad',
  'celestrak',
  'discosweb',
  'dsn',
  'enlil',
  'horizons',
  'neocc',
  'sbdb',
  'scout',
  'solar-wind',
  'space-track',
  'suvi',
]

const HTTP_CODE = /\b\d{3}\b/
const ISSUE_REF = /#\d+/

describe('the orrery Data sources list (#207)', () => {
  it('shows only the sources the orrery uses', () => {
    expect(SOURCES.map((s) => s.id).sort()).toEqual(USED)
  })

  it('gives every source a plain visitor sentence, without HTTP codes or issue numbers', () => {
    for (const s of SOURCES) {
      expect(s.gives, s.id).toMatch(/^[A-Z].{10,}\.$/)
      for (const text of [s.name, s.gives, s.credit ?? '']) {
        expect(text, s.id).not.toMatch(HTTP_CODE)
        expect(text, s.id).not.toMatch(ISSUE_REF)
      }
    }
  })

  it('carries nothing for us: no status, note or terms reach the client', () => {
    for (const s of SOURCES) {
      for (const key of Object.keys(s)) {
        expect(['id', 'name', 'docs', 'gives', 'credit'], `${s.id}.${key}`).toContain(key)
      }
    }
  })

  it('links each name to its documentation over https', () => {
    for (const s of SOURCES) expect(s.docs, s.id).toMatch(/^https:\/\//)
  })

  it('credits Space-Track.org, as its terms require (ADR 0013)', () => {
    expect(SOURCES.find((s) => s.id === 'space-track')?.credit).toContain('Space-Track.org')
  })

  it('has unique ids', () => {
    const ids = SOURCES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
