import { describe, expect, it } from 'vitest'

import {
  bzStatus,
  dstStatus,
  flareStatus,
  gdacsStatus,
  kpStatus,
  noaaScaleStatus,
  nwsStatus,
  palermoStatus,
  quakeStatus,
  statusVar,
} from '@/lib/severity'

describe('kpStatus (NOAA G1 starts at Kp 5)', () => {
  it.each([
    [0, 'nominal'],
    [4.9, 'nominal'],
    [5, 'watch'],
    [6.9, 'watch'],
    [7, 'hazard'],
    [9, 'hazard'],
  ] as const)('Kp %s is %s', (kp, status) => {
    expect(kpStatus(kp)).toBe(status)
  })
})

describe('dstStatus (reconciled: spine used -50 for hazard, panel used -100)', () => {
  it.each([
    [-10, 'nominal'],
    [-49, 'nominal'],
    [-50, 'watch'],
    [-99, 'watch'],
    [-100, 'hazard'],
  ] as const)('Dst %s nT is %s', (dst, status) => {
    expect(dstStatus(dst)).toBe(status)
  })
})

describe('flareStatus', () => {
  it.each([
    ['X1.2', 'hazard'],
    ['M5.0', 'watch'],
    ['C3.1', 'nominal'],
    ['B1.0', 'nominal'],
  ] as const)('%s is %s', (cls, status) => {
    expect(flareStatus(cls)).toBe(status)
  })

  it('returns null when there is no flare class', () => {
    expect(flareStatus(null)).toBeNull()
  })
})

describe('bzStatus', () => {
  it('southward Bz couples to the magnetosphere and is a watch', () => {
    expect(bzStatus(-0.1)).toBe('watch')
    expect(bzStatus(0)).toBe('nominal')
    expect(bzStatus(4)).toBe('nominal')
  })
})

describe('quakeStatus', () => {
  it.each([
    [3.9, 'nominal'],
    [4.5, 'watch'],
    [6, 'hazard'],
  ] as const)('M%s is %s', (m, status) => {
    expect(quakeStatus(m)).toBe(status)
  })
})

describe('palermoStatus', () => {
  it('flags Palermo above -2 as hazard and anything lower as nominal', () => {
    expect(palermoStatus(-1.5)).toBe('hazard')
    expect(palermoStatus(-2)).toBe('nominal')
    expect(palermoStatus(-6)).toBe('nominal')
  })
})

describe('noaaScaleStatus (R, S and G scales 0..5)', () => {
  it.each([
    [0, 'nominal'],
    [1, 'watch'],
    [2, 'watch'],
    [3, 'hazard'],
    [5, 'hazard'],
  ] as const)('scale %s is %s', (n, status) => {
    expect(noaaScaleStatus(n)).toBe(status)
  })
})

describe('gdacsStatus', () => {
  it('maps the alert level, case-insensitive', () => {
    expect(gdacsStatus('Red')).toBe('hazard')
    expect(gdacsStatus('orange')).toBe('watch')
    expect(gdacsStatus('Green')).toBe('nominal')
    expect(gdacsStatus('something new')).toBe('nominal')
  })
})

describe('nwsStatus', () => {
  it('splits hazard into extreme and severe tiers so the glyph can differ', () => {
    expect(nwsStatus('Extreme')).toEqual({ status: 'hazard', tier: 'extreme' })
    expect(nwsStatus('Severe')).toEqual({ status: 'hazard', tier: 'severe' })
    expect(nwsStatus('Moderate')).toEqual({ status: 'watch', tier: 'moderate' })
    expect(nwsStatus('Minor')).toEqual({ status: 'watch', tier: 'minor' })
    expect(nwsStatus('Unknown')).toEqual({ status: 'nominal', tier: 'unknown' })
  })
})

describe('statusVar', () => {
  it('maps each status to its token', () => {
    expect(statusVar('nominal')).toBe('var(--terminal)')
    expect(statusVar('watch')).toBe('var(--amber)')
    expect(statusVar('hazard')).toBe('var(--mcrn)')
    expect(statusVar(null)).toBe('var(--bone-dim)')
  })
})
