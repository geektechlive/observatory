/**
 * The orrery's distance readouts pick their unit by size (#217): a pass of a few thousand
 * km used to read "0.000 au / 0.0 million km", which looks like a collision.
 */
import { describe, expect, it } from 'vitest'

import { distanceReadout, distanceText } from '@/components/orrery/distanceText'
import { AU_KM, KM_TO_MI } from '@/lib/orrery/units'

const au = (km: number) => km / AU_KM

describe('distanceReadout (#217)', () => {
  it('reads a close pass in whole km, with miles beside it', () => {
    expect(distanceReadout(au(6_371), { miles: true })).toEqual({
      value: '6,371',
      unit: 'km',
      aside: '3,959 mi',
    })
  })

  it('never reads a real pass as zero', () => {
    const r = distanceReadout(au(12))
    expect(r.value).toBe('12')
    expect(r.unit).toBe('km')
  })

  it('switches to million km at 1 million km, with the au beside it', () => {
    expect(distanceReadout(au(999_999)).unit).toBe('km')
    expect(distanceReadout(au(1_500_000), { miles: true })).toEqual({
      value: '1.50',
      unit: 'million km',
      aside: '0.0100 au · 932,057 mi',
    })
  })

  it('switches to au from 0.1 au, with km (and miles) beside it as before', () => {
    expect(distanceReadout(0.0999).unit).toBe('million km')
    expect(distanceReadout(1)).toEqual({ value: '1.000', unit: 'au', aside: '149.6 million km' })
    expect(distanceReadout(1, { miles: true }).aside).toBe('149.6 million km · 93.0 million mi')
    expect(distanceReadout(30.07)).toEqual({
      value: '30.07',
      unit: 'au',
      aside: '4.50 billion km',
    })
  })

  it('keeps three or more significant figures in every unit', () => {
    expect(distanceReadout(au(2_345_678)).value).toBe('2.35')
    expect(distanceReadout(0.25).value).toBe('0.250')
  })
})

describe('distanceReadout at the unit boundaries (#217)', () => {
  it('moves to million km when whole km would round up to 1,000,000', () => {
    expect(distanceReadout(au(999_999.4)).value).toBe('999,999')
    expect(distanceReadout(au(999_999.6))).toMatchObject({ value: '1.00', unit: 'million km' })
  })

  it('moves to billion when million would round up to 1000.0', () => {
    expect(distanceReadout(au(999_940_000)).aside).toBe('999.9 million km')
    expect(distanceReadout(au(999_960_000)).aside).toBe('1.00 billion km')
  })

  it('moves to million miles when whole miles would round up to 1,000,000', () => {
    const km = 999_999.6 / KM_TO_MI
    expect(distanceReadout(au(km), { miles: true }).aside).toContain('1.0 million mi')
  })

  it('drops to two decimals in au when three would round up to 10.000', () => {
    expect(distanceReadout(9.9994).value).toBe('9.999')
    expect(distanceReadout(9.9996).value).toBe('10.00')
  })

  it('switches from million km to au exactly at 0.1 au', () => {
    expect(distanceReadout(0.1).unit).toBe('au')
    expect(distanceReadout(0.1).value).toBe('0.100')
  })
})

describe('distanceText (#217)', () => {
  it('writes the readout as prose', () => {
    expect(distanceText(au(6_371))).toBe('6,371 km')
    expect(distanceText(au(7_480_000))).toBe('7.48 million km')
    expect(distanceText(1.0167)).toBe('1.017 au')
  })
})
