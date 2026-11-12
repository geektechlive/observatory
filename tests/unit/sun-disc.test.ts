/**
 * Placing SWPC's active regions on SDO's disc (#210). The check against reality: SDO/HMI's
 * quick-look magnetogram of 2026-11-12 05:00 UTC shows region 4566 (S07W48 at 2400Z, the
 * big Beta-Gamma group) centred near pixel (880, 588) of the 1024 px frame, and AIA 171
 * at 05:26 UTC has the solar limb about 405 px from the centre.
 */
import { describe, expect, it } from 'vitest'

import { discRadiusShare, regionOnDisc, solarB0Deg, synodicRateDegPerDay } from '@/lib/sunDisc'

const VALID_AT = '2026-11-12T00:00:00Z'
const HMI_AT = '2026-11-12T05:00:00Z'

describe('solarB0Deg', () => {
  it('matches the almanac tilt of the solar equator toward Earth', () => {
    // Almanac values: B0 is about +7.25 deg in early September, near 0 in early June and
    // early December, about -7.25 deg in early March.
    expect(solarB0Deg(new Date('2026-09-08T00:00:00Z'))).toBeCloseTo(7.25, 0)
    expect(solarB0Deg(new Date('2026-03-06T00:00:00Z'))).toBeCloseTo(-7.25, 0)
    expect(Math.abs(solarB0Deg(new Date('2026-12-07T00:00:00Z')))).toBeLessThan(0.3)
    expect(solarB0Deg(new Date(HMI_AT))).toBeCloseTo(3.2, 0)
  })
})

describe('synodicRateDegPerDay', () => {
  it('turns faster at the equator than at higher latitudes, about 13.7 deg a day at it', () => {
    expect(synodicRateDegPerDay(0)).toBeCloseTo(13.73, 1)
    expect(synodicRateDegPerDay(30)).toBeLessThan(synodicRateDegPerDay(0))
  })
})

describe('discRadiusShare', () => {
  it('gives the limb radius as a share of the frame half-width, per instrument', () => {
    const at = new Date('2026-11-12T05:26:22Z')
    // AIA latest_1024: limb ~405 px of 512. HMI quick-look: ~480 px of 512.
    expect(discRadiusShare('0171', at) * 512).toBeGreaterThan(398)
    expect(discRadiusShare('0171', at) * 512).toBeLessThan(410)
    expect(discRadiusShare('HMIB', at) * 512).toBeGreaterThan(474)
    expect(discRadiusShare('HMIB', at) * 512).toBeLessThan(486)
    expect(discRadiusShare('211193171', at)).toBe(discRadiusShare('0171', at))
  })
})

describe('regionOnDisc', () => {
  it("puts 4566 where HMI saw it, after turning it with the Sun's rotation", () => {
    const p = regionOnDisc({ latitude: -7, longitude: -48 }, VALID_AT, new Date(HMI_AT))
    expect(p).not.toBeNull()
    const share = discRadiusShare('HMIB', new Date(HMI_AT))
    const px = 512 + (p?.x ?? 0) * share * 512
    const py = 512 - (p?.y ?? 0) * share * 512
    expect(Math.abs(px - 880)).toBeLessThan(12)
    expect(Math.abs(py - 588)).toBeLessThan(12)
  })

  it('puts an east-limb region on the left and a north one above the centre', () => {
    const p = regionOnDisc({ latitude: 16, longitude: 61 }, VALID_AT, new Date(VALID_AT))
    expect(p?.x).toBeLessThan(-0.8)
    expect(p?.y).toBeGreaterThan(0.2)
  })

  it('drops a region that has turned behind the west limb', () => {
    // N14W85 at 2400Z is past the limb within half a day.
    const later = new Date(Date.parse(VALID_AT) + 12 * 3_600_000)
    expect(regionOnDisc({ latitude: 14, longitude: -85 }, VALID_AT, later)).toBeNull()
  })

  it('drops positions too old to turn honestly (more than two days)', () => {
    const late = new Date(Date.parse(VALID_AT) + 49 * 3_600_000)
    expect(regionOnDisc({ latitude: 0, longitude: 40 }, VALID_AT, late)).toBeNull()
  })
})
