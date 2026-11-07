import { describe, expect, it } from 'vitest'

import {
  boxscoreUrl,
  bucketHistory,
  dailyDue,
  decayUrl,
  gpHistoryUrl,
  HISTORY_OBJECTS,
  historyPlan,
  mergeDecays,
  parseBoxscore,
  parseDecays,
  parseSatcat,
  parseTip,
  SATCAT_SHARDS,
  satcatShardOf,
  satcatUrl,
  tipUrl,
} from '@/lib/spacetrack'

// Synthetic records: the field names follow Space-Track's own column names, as shown in
// its SATCAT, Box Score and Decay/Reentry tables (2026-11-07). Values are made up but
// typed as Space-Track sends them (JSON with numbers as strings).

const day = (iso: string) => Date.parse(iso)

describe('dailyDue (Space-Track: SATCAT, Box Score and Decay once per day after 1700 UTC)', () => {
  it('is never due before 17:00 UTC', () => {
    expect(dailyDue(day('2026-11-08T16:59:00Z'), null)).toBe(false)
    expect(dailyDue(day('2026-11-08T06:17:00Z'), '2026-11-06T18:17:00Z')).toBe(false)
  })

  it('is due after 17:00 UTC when the last fetch was before today 17:00', () => {
    expect(dailyDue(day('2026-11-08T18:17:00Z'), null)).toBe(true)
    expect(dailyDue(day('2026-11-08T18:17:00Z'), '2026-11-07T18:17:00Z')).toBe(true)
    expect(dailyDue(day('2026-11-08T18:17:00Z'), '2026-11-08T16:00:00Z')).toBe(true)
  })

  it('is not due twice in one UTC day', () => {
    expect(dailyDue(day('2026-11-08T23:17:00Z'), '2026-11-08T18:17:00Z')).toBe(false)
  })

  it('treats an unreadable last time as never fetched', () => {
    expect(dailyDue(day('2026-11-08T18:17:00Z'), 'not a date')).toBe(true)
  })
})

describe('query URLs', () => {
  it('asks TIP for re-entries still ahead, from messages of the last two weeks', () => {
    const url = tipUrl()
    expect(url).toMatch(/^https:\/\/www\.space-track\.org\/basicspacedata\/query\/class\/tip\//)
    expect(url).toContain('/DECAY_EPOCH/%3Enow/')
    expect(url).toContain('/INSERT_EPOCH/%3Enow-14/')
    expect(url).toMatch(/\/format\/json$/)
  })

  it("asks Decay for the day's messages only, as the guidelines say", () => {
    expect(decayUrl()).toContain('/class/decay/MSG_EPOCH/%3Enow-1/')
  })

  it('asks SATCAT for current on-orbit objects, only the columns it keeps', () => {
    const url = satcatUrl()
    expect(url).toContain('/class/satcat/')
    expect(url).toContain('/CURRENT/Y/')
    expect(url).toContain('/DECAY/null-val/')
    expect(url).toContain('/predicates/')
    expect(url).toContain('NORAD_CAT_ID')
  })

  it('asks the Box Score as one table', () => {
    expect(boxscoreUrl()).toMatch(/\/class\/boxscore\/format\/json$/)
  })

  it('asks GP_HISTORY for one object over one completed month', () => {
    const url = gpHistoryUrl('25544', '2026-09')
    expect(url).toContain('/class/gp_history/NORAD_CAT_ID/25544/')
    expect(url).toContain('/EPOCH/2026-09-01--2026-10-01/')
    expect(url).toMatch(/\/format\/json$/)
  })

  it('never puts anything but the query in the URL', () => {
    for (const url of [tipUrl(), decayUrl(), satcatUrl(), boxscoreUrl()]) {
      expect(url).not.toMatch(/identity|password|@/i)
    }
  })
})

describe('parseTip', () => {
  const tip = (over: Record<string, unknown>) => ({
    NORAD_CAT_ID: '45700',
    MSG_EPOCH: '2026-11-07 20:06:00',
    INSERT_EPOCH: '2026-11-07 20:10:12',
    DECAY_EPOCH: '2026-11-11 20:32:00',
    WINDOW: '2880',
    REV: '33000',
    DIRECTION: 'ascending',
    LAT: '12.3',
    LON: '-45.6',
    INCL: '53.0',
    NEXT_REPORT: '24',
    ID: '1',
    HIGH_INTEREST: 'N',
    OBJECT_NUMBER: '45700',
    ...over,
  })

  it('keeps the newest message per object, soonest re-entry first', () => {
    const out = parseTip([
      tip({}),
      tip({ MSG_EPOCH: '2026-11-08 08:00:00', DECAY_EPOCH: '2026-11-11 18:00:00', WINDOW: '1440' }),
      tip({ NORAD_CAT_ID: '53740', DECAY_EPOCH: '2026-11-09 18:29:00', WINDOW: '720' }),
    ])
    expect(out.map((r) => r.noradId)).toEqual(['53740', '45700'])
    expect(out[1]).toMatchObject({
      decayEpoch: '2026-11-11T18:00:00Z',
      windowMin: 1440,
      msgEpoch: '2026-11-08T08:00:00Z',
      lat: 12.3,
      lon: -45.6,
      highInterest: false,
    })
  })

  it('throws on a reply that is not a list of TIP messages (contract)', () => {
    expect(() => parseTip({ error: 'nope' })).toThrow(/TIP/)
    expect(() => parseTip([{ NORAD_CAT_ID: '1' }])).toThrow(/DECAY_EPOCH/)
  })

  it('accepts an empty list: some weeks nothing is coming down', () => {
    expect(parseTip([])).toEqual([])
  })
})

describe('parseDecays and mergeDecays', () => {
  const msg = (over: Record<string, unknown>) => ({
    NORAD_CAT_ID: '46563',
    OBJECT_NUMBER: '46563',
    OBJECT_NAME: 'STARLINK-1730',
    INTLDES: '2020-070AH',
    OBJECT_ID: '2020-070AH',
    RCS: '2',
    RCS_SIZE: 'LARGE',
    COUNTRY: 'US',
    MSG_EPOCH: '2026-11-07 17:33:59',
    DECAY_EPOCH: '2026-11-07 0:00:00',
    SOURCE: 'satcat',
    MSG_TYPE: 'Historical',
    PRECEDENCE: '1',
    ...over,
  })

  it('reads names, kinds and dates', () => {
    const [d] = parseDecays([msg({})])
    expect(d).toEqual({
      noradId: '46563',
      name: 'STARLINK-1730',
      country: 'US',
      decayEpoch: '2026-11-07T00:00:00Z',
      msgEpoch: '2026-11-07T17:33:59Z',
      kind: 'historical',
    })
    const [p] = parseDecays([msg({ MSG_TYPE: 'Prediction', SOURCE: 'TIP_msg' })])
    expect(p?.kind).toBe('prediction')
  })

  it('keeps 30 days of re-entries, newest first, one per object', () => {
    const now = day('2026-11-08T18:00:00Z')
    const old = parseDecays([msg({ NORAD_CAT_ID: '1', DECAY_EPOCH: '2026-09-01 0:00:00' })])
    const prev = parseDecays([msg({ NORAD_CAT_ID: '2', DECAY_EPOCH: '2026-11-01 0:00:00' })])
    const fresh = parseDecays([
      msg({
        NORAD_CAT_ID: '2',
        DECAY_EPOCH: '2026-11-02 0:00:00',
        MSG_EPOCH: '2026-11-08 17:00:00',
      }),
      msg({ NORAD_CAT_ID: '3', DECAY_EPOCH: '2026-11-07 0:00:00' }),
      msg({ NORAD_CAT_ID: '4', MSG_TYPE: 'Prediction', DECAY_EPOCH: '2026-11-12 0:00:00' }),
    ])
    const out = mergeDecays([...old, ...prev], fresh, now)
    expect(out.map((d) => d.noradId)).toEqual(['3', '2'])
    expect(out[1]?.decayEpoch).toBe('2026-11-02T00:00:00Z')
  })
})

describe('parseBoxscore', () => {
  const row = (country: string, n: number) => ({
    COUNTRY: country,
    SPADOC_CD: country,
    ORBITAL_TBA: String(n),
    ORBITAL_PAYLOAD_COUNT: String(n * 10),
    ORBITAL_ROCKET_BODY_COUNT: String(n * 2),
    ORBITAL_DEBRIS_COUNT: String(n * 5),
    ORBITAL_TOTAL_COUNT: String(n * 18),
    DECAYED_PAYLOAD_COUNT: String(n),
    DECAYED_ROCKET_BODY_COUNT: String(n),
    DECAYED_DEBRIS_COUNT: String(n),
    DECAYED_TOTAL_COUNT: String(n * 3),
    COUNTRY_TOTAL: String(n * 21),
  })

  it('reads the ALL row', () => {
    const out = parseBoxscore([row('ALGERIA', 1), { ...row('ALL', 100), SPADOC_CD: 'ALL' }])
    expect(out).toEqual({
      inOrbit: { payload: 1000, rocketBody: 200, debris: 500, unassigned: 100, total: 1800 },
      decayed: { payload: 100, rocketBody: 100, debris: 100, total: 300 },
      catalogued: 2100,
    })
  })

  it('throws when the ALL row is missing (contract)', () => {
    expect(() => parseBoxscore([row('ALGERIA', 1)])).toThrow(/ALL/)
  })
})

describe('parseSatcat and its shards', () => {
  const rec = (id: string, over: Record<string, unknown> = {}) => ({
    NORAD_CAT_ID: id,
    INTLDES: '1998-067A',
    OBJECT_TYPE: 'PAYLOAD',
    SATNAME: 'ISS (ZARYA)',
    COUNTRY: 'ISS',
    LAUNCH: '1998-11-20',
    SITE: 'TTMTR',
    RCS_SIZE: 'LARGE',
    ...over,
  })

  it('keeps the catalogue columns as compact rows', () => {
    expect(parseSatcat([rec('25544')])).toEqual([
      ['25544', '1998-067A', 'PAYLOAD', 'ISS', '1998-11-20', 'TTMTR', 'LARGE'],
    ])
  })

  it('keeps an object with no size or site, as empty text', () => {
    const [r] = parseSatcat([rec('5', { RCS_SIZE: null, SITE: null })])
    expect(r?.[5]).toBe('')
    expect(r?.[6]).toBe('')
  })

  it('throws on a reply without NORAD ids (contract)', () => {
    expect(() => parseSatcat([{ SATNAME: 'X' }])).toThrow(/NORAD_CAT_ID/)
    expect(() => parseSatcat('nope')).toThrow(/SATCAT/)
  })

  it('spreads objects over the shards by NORAD id, six-digit ids included', () => {
    expect(SATCAT_SHARDS).toBe(16)
    expect(satcatShardOf('25544')).toBe(25544 % 16)
    expect(satcatShardOf('100000')).toBe(100000 % 16)
    expect(satcatShardOf('x')).toBeNull()
  })
})

describe('GP_HISTORY: a handful of objects, weekly, each completed month fetched once', () => {
  it('lists famous objects with the month their history starts', () => {
    const ids = HISTORY_OBJECTS.map((o) => o.noradId)
    expect(ids).toContain('25544')
    expect(ids).toContain('20580')
    for (const o of HISTORY_OBJECTS) expect(o.fromMonth).toMatch(/^\d{4}-\d{2}$/)
  })

  it('plans completed months newest first, never the current month, never one already fetched', () => {
    const now = day('2026-11-08T18:00:00Z')
    const plan = historyPlan(now, { '25544': ['2026-10'] }, 4, [
      { noradId: '25544', name: 'ISS', fromMonth: '2026-01' },
      { noradId: '20580', name: 'HST', fromMonth: '2026-08' },
    ])
    expect(plan).toEqual([
      { noradId: '25544', month: '2026-09' },
      { noradId: '20580', month: '2026-10' },
      { noradId: '25544', month: '2026-08' },
      { noradId: '20580', month: '2026-09' },
    ])
  })

  it('plans nothing once every month is fetched', () => {
    const now = day('2026-11-08T18:00:00Z')
    expect(
      historyPlan(now, { '1': ['2026-09', '2026-10'] }, 4, [
        { noradId: '1', name: 'X', fromMonth: '2026-09' },
      ]),
    ).toEqual([])
  })

  it('keeps the first element set of each week, by epoch', () => {
    const omm = (epoch: string, mm: number) => ({
      OBJECT_NAME: 'ISS (ZARYA)',
      OBJECT_ID: '1998-067A',
      NORAD_CAT_ID: '25544',
      EPOCH: epoch,
      MEAN_MOTION: String(mm),
      ECCENTRICITY: '0.0005',
      INCLINATION: '51.6',
      RA_OF_ASC_NODE: '100',
      ARG_OF_PERICENTER: '90',
      MEAN_ANOMALY: '270',
      BSTAR: '0.0001',
      MEAN_MOTION_DOT: '0.0001',
      MEAN_MOTION_DDOT: '0',
    })
    // Weeks start on Thursdays (1970-01-01 was one): 09-01 is a Tuesday, 09-03 a Thursday.
    const kept = bucketHistory([
      omm('2026-09-03T12:00:00.000000', 15.5),
      omm('2026-09-01T06:00:00.000000', 15.49),
      omm('2026-09-01T18:00:00.000000', 15.491),
      omm('2026-09-10T00:00:00.000000', 15.51),
      { NORAD_CAT_ID: '25544' },
    ])
    expect(kept.map((r) => r['EPOCH'])).toEqual([
      '2026-09-01T06:00:00.000000',
      '2026-09-03T12:00:00.000000',
      '2026-09-10T00:00:00.000000',
    ])
  })
})
