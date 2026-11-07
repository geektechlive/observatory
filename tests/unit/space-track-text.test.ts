import { describe, expect, it } from 'vitest'

import { boxscoreLine, discosSize, objectTypeText, ownerText, rcsText } from '@/lib/satcatWords'
import { reentriesWithin, reentryTickerItems, reentryWhen } from '@/lib/spaceTrackText'

const NOW = Date.parse('2026-11-08T00:00:00Z')
const reentry = (noradId: string, decayEpoch: string, windowMin = 780) => ({
  noradId,
  decayEpoch,
  windowMin,
  msgEpoch: '2026-11-07T20:00:00Z',
  lat: null,
  lon: null,
  highInterest: false,
})

describe('reentryWhen', () => {
  it('says when, in UTC, and the window in hours', () => {
    expect(reentryWhen(reentry('1', '2026-11-11T20:32:00Z', 780))).toBe(
      '11 Nov 20:32 UTC, give or take 13 h',
    )
  })

  it('says minutes when the window is under two hours', () => {
    expect(reentryWhen(reentry('1', '2026-11-11T20:32:00Z', 45))).toBe(
      '11 Nov 20:32 UTC, give or take 45 min',
    )
  })
})

describe('reentriesWithin', () => {
  it('keeps the predictions still ahead within the days asked', () => {
    const list = [
      reentry('a', '2026-11-07T12:00:00Z'),
      reentry('b', '2026-11-09T00:00:00Z'),
      reentry('c', '2026-11-20T00:00:00Z'),
    ]
    expect(reentriesWithin(list, NOW, 7).map((r) => r.noradId)).toEqual(['b'])
  })
})

describe('reentryTickerItems', () => {
  it('one ticker line per prediction this week, named when the name is known', () => {
    const items = reentryTickerItems(
      {
        reentries: [reentry('45700', '2026-11-11T20:32:00Z'), reentry('9', '2026-11-09T01:00:00Z')],
        names: { '45700': 'STARLINK-1400' },
      },
      NOW,
    )
    expect(items).toHaveLength(2)
    // Soonest first.
    expect(items[0]?.description).toMatch(/^NORAD 9 · /)
    expect(items[1]).toMatchObject({
      id: 'reentry-45700',
      type: 'reentry',
      label: 'RE-ENTRY',
      description: 'STARLINK-1400 · 11 Nov 20:32 UTC, give or take 13 h',
    })
    expect(items[1]?.time.toISOString()).toBe('2026-11-11T20:32:00.000Z')
  })
})

describe('catalogue words', () => {
  it('Box Score as one line, with Space-Track named', () => {
    expect(
      boxscoreLine({
        inOrbit: { payload: 19870, rocketBody: 2434, debris: 12545, total: 35526 },
      }),
    ).toBe(
      'Space-Track tracks 35,526 objects in orbit: 19,870 satellites, 2,434 rocket bodies and 12,545 pieces of debris.',
    )
  })

  it('object types and radar sizes in plain words (Space-Track’s own bands)', () => {
    expect(objectTypeText('PAYLOAD')).toBe('Satellite or spacecraft')
    expect(objectTypeText('ROCKET BODY')).toBe('Rocket stage')
    expect(objectTypeText('DEBRIS')).toBe('Debris')
    expect(objectTypeText('TBA')).toBe('Not yet identified')
    expect(rcsText('SMALL')).toBe('Small on radar (under 0.1 m)')
    expect(rcsText('MEDIUM')).toBe('Medium on radar (0.1 to 1 m)')
    expect(rcsText('LARGE')).toBe('Large on radar (over 1 m)')
    expect(rcsText('')).toBeNull()
    expect(ownerText('CIS')).toBe('Russia (CIS, the former USSR) (CIS)')
    expect(ownerText('ZZZ')).toBe('ZZZ')
  })

  it('DISCOS size as the dimensions it has', () => {
    expect(
      discosSize({ widthM: 72.8, heightM: 20, depthM: 108.5, diameterM: null, spanM: 108.5 }),
    ).toBe('72.8 × 20 × 108.5 m, 108.5 m across')
    expect(
      discosSize({ widthM: null, heightM: 3.2, depthM: null, diameterM: 1.8, spanM: null }),
    ).toBe('1.8 m wide, 3.2 m tall')
    expect(
      discosSize({ widthM: null, heightM: null, depthM: null, diameterM: null, spanM: null }),
    ).toBeNull()
  })
})
