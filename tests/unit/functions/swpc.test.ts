import { describe, expect, it } from 'vitest'

import { parseKp, parsePsw } from '../../../functions/api/_swpc'

describe('parseKp', () => {
  it('parses the noaa-planetary-k-index.json array-of-objects shape', () => {
    const input = [
      { time_tag: '2026-09-06 00:00:00.000', Kp: 2.33, a_running: 7, station_count: 12 },
      { time_tag: '2026-09-06 03:00:00.000', Kp: 3.67, a_running: 9, station_count: 12 },
    ]
    expect(parseKp(input)).toEqual([
      { time: '2026-09-06 00:00:00.000', kp: 2.33 },
      { time: '2026-09-06 03:00:00.000', kp: 3.67 },
    ])
  })

  it('returns [] (degraded signal) for a malformed payload', () => {
    // Missing the required Kp field on one entry — the whole array fails validation
    // rather than silently dropping just the bad row, so callers can treat an
    // empty result as "upstream shape changed, mark degraded" instead of quietly
    // serving a partial series.
    const input = [{ time_tag: '2026-09-06 00:00:00.000' }]
    expect(parseKp(input)).toEqual([])
  })

  it('returns [] for a non-array payload', () => {
    expect(parseKp({ error: 'not found' })).toEqual([])
  })
})

describe('parsePsw', () => {
  const header = [
    'time_tag',
    'speed',
    'density',
    'temperature',
    'bx',
    'by',
    'bz',
    'bt',
    'vx',
    'vy',
    'vz',
    'propagated_time_tag',
  ]

  it('parses numeric-cell rows looked up by header name', () => {
    const input = [
      header,
      [
        '2026-09-06 00:00:00.000',
        412.5,
        3.2,
        95000,
        -1.1,
        2.4,
        -3.8,
        4.6,
        -410,
        12,
        5,
        '2026-09-06 00:31:00.000',
      ],
    ]
    expect(parsePsw(input)).toEqual([
      { time: '2026-09-06 00:00:00.000', speed: 412.5, density: 3.2, bz: -3.8 },
    ])
  })

  it('coerces numeric-string and passes through null cells', () => {
    const input = [
      header,
      ['2026-09-06 00:01:00.000', '410.1', null, 95000, -1.1, 2.4, null, 4.6, -410, 12, 5, null],
    ]
    expect(parsePsw(input)).toEqual([
      { time: '2026-09-06 00:01:00.000', speed: 410.1, density: null, bz: null },
    ])
  })

  it('skips a malformed row whose time_tag cell is not a string', () => {
    const input = [
      header,
      [null, 412.5, 3.2, 95000, -1.1, 2.4, -3.8, 4.6, -410, 12, 5, null],
      ['2026-09-06 00:02:00.000', 415.0, 3.1, 95100, -1.0, 2.3, -3.6, 4.4, -415, 11, 4, null],
    ]
    expect(parsePsw(input)).toEqual([
      { time: '2026-09-06 00:02:00.000', speed: 415.0, density: 3.1, bz: -3.6 },
    ])
  })

  it('returns [] (degraded signal) when the feed has no data rows', () => {
    expect(parsePsw([header])).toEqual([])
  })

  it('returns [] (degraded signal) for a completely malformed payload', () => {
    expect(parsePsw({ error: 'not found' })).toEqual([])
  })
})
