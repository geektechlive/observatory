/**
 * The orrery's reading of the re-entry objects' elements (#154): the first-load schema
 * lets `tip.elements` through unchecked, and this is where each row is checked.
 */
import { describe, expect, it } from 'vitest'

import { isSatRow } from '@/lib/orbit/satCatalog'
import { reentryElementRows } from '@/lib/orrery/reentryElements'
import { SpaceTrackSchema } from '@/schemas/spaceTrack'

const row = (id: string): unknown[] => [
  `OBJ ${id}`,
  id,
  '2021-001A',
  '2026-11-12T10:00:00.000000',
  16,
  0.0002,
  53,
  100,
  90,
  270,
  0.0003,
  0.0001,
  0,
]

describe('isSatRow', () => {
  it('accepts a stored row and refuses short, non-numeric and unreadable-epoch rows', () => {
    expect(isSatRow(row('1'))).toBe(true)
    expect(isSatRow(row('1').slice(0, 12))).toBe(false)
    expect(isSatRow([...row('1').slice(0, 4), 'x', ...row('1').slice(5)])).toBe(false)
    expect(isSatRow([...row('1').slice(0, 3), 'not a date', ...row('1').slice(4)])).toBe(false)
    expect(isSatRow(null)).toBe(false)
  })
})

describe('reentryElementRows', () => {
  it('keeps well-formed rows of the listed objects, one each, and nothing else', () => {
    const rows = reentryElementRows(
      [row('53630'), row('53630'), row('11111'), ['junk'], null],
      new Set(['53630', '45390']),
    )
    expect(rows.map((r) => r[1])).toEqual(['53630'])
  })

  it('is empty for no elements, or for something that is not a list', () => {
    expect(reentryElementRows(undefined, new Set(['1']))).toEqual([])
    expect(reentryElementRows({ rows: [] }, new Set(['1']))).toEqual([])
  })
})

describe('the first-load schema', () => {
  const body = (elements?: unknown) => ({
    generatedAt: '2026-11-12T12:00:00.000Z',
    citation: 'Space-Track.org',
    tip: {
      fetchedAt: '2026-11-12T12:00:00.000Z',
      reentries: [],
      ...(elements === undefined ? {} : { elements }),
    },
    decays: null,
    boxscore: null,
    satcatAt: null,
    names: {},
    missing: [],
  })

  it('carries tip.elements through unchecked, and does not need it', () => {
    const rows = [row('53630'), ['junk']]
    expect(SpaceTrackSchema.parse(body(rows)).tip?.elements).toEqual(rows)
    expect(SpaceTrackSchema.parse(body()).tip?.elements).toBeUndefined()
  })
})
