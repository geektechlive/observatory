/**
 * A satellite in the shareable link (#158): `focus=sat:<NORAD id>`, the rules for
 * finding it once its groups load, and the switch a chosen satellite needs.
 */
import { describe, expect, it } from 'vitest'

import { parseOrreryLink, serialiseOrreryLink } from '@/components/orrery/orreryLink'
import { satIdFromFocus, satLinkStep } from '@/components/orrery/satLink'
import {
  ALL_SAT_TOGGLES_ON,
  DEFAULT_SAT_TOGGLES,
  downloadText,
  SAT_TOGGLES,
  toggleForGroup,
  withToggleOn,
} from '@/components/orrery/satToggles'
import { SAT_GROUPS } from '@/lib/orbit/satCatalog'

describe('satIdFromFocus', () => {
  it('reads sat:<id>, six-digit numbers included', () => {
    expect(satIdFromFocus('sat:25544')).toBe('25544')
    expect(satIdFromFocus('sat:100000')).toBe('100000')
  })

  it('ignores everything else', () => {
    expect(satIdFromFocus('Mars')).toBeNull()
    expect(satIdFromFocus('sat:')).toBeNull()
    expect(satIdFromFocus('sat:abc')).toBeNull()
    expect(satIdFromFocus('sat:12 34')).toBeNull()
    expect(satIdFromFocus('naif:-31')).toBeNull()
  })
})

describe('the link format for a satellite', () => {
  it('round-trips, with the colon kept readable', () => {
    const hash = serialiseOrreryLink({ t: null, focus: 'sat:44713', preset: 'orbit' })
    expect(hash).toBe('#orrery?focus=sat:44713&preset=orbit')
    expect(parseOrreryLink(hash)).toEqual({ t: null, focus: 'sat:44713', preset: 'orbit' })
  })
})

describe('satLinkStep', () => {
  it('selects the satellite as soon as it is loaded', () => {
    expect(satLinkStep({ found: true, settled: false, allOn: false })).toBe('select')
  })

  it('waits while groups are still loading', () => {
    expect(satLinkStep({ found: false, settled: false, allOn: false })).toBe('wait')
  })

  it('switches on the groups that are off when the loaded ones do not hold it', () => {
    expect(satLinkStep({ found: false, settled: true, allOn: false })).toBe('widen')
  })

  it('drops an unknown satellite once every group has settled', () => {
    expect(satLinkStep({ found: false, settled: true, allOn: true })).toBe('drop')
  })
})

describe('the switch for a satellite’s group', () => {
  it('maps every stored group to a switch', () => {
    for (const g of SAT_GROUPS) {
      const id = toggleForGroup(g.id)
      expect(SAT_TOGGLES.find((t) => t.id === id)?.groups).toContain(g.id)
    }
  })

  it('maps the three debris clouds to the one debris switch', () => {
    expect(toggleForGroup('iridium-33-debris')).toBe('debris')
    expect(toggleForGroup('gps-ops')).toBe('gps')
  })

  it('switches one on without touching the rest, and returns the same object if already on', () => {
    const next = withToggleOn(DEFAULT_SAT_TOGGLES, 'starlink')
    expect(next).toEqual({ ...DEFAULT_SAT_TOGGLES, starlink: true })
    expect(withToggleOn(next, 'starlink')).toBe(next)
  })

  it('has an all-on set', () => {
    expect(Object.values(ALL_SAT_TOGGLES_ON).every(Boolean)).toBe(true)
  })
})

describe('downloadText', () => {
  it('gives a measured size for the groups with a notable download', () => {
    const t = (id: string) => ({
      downloadKb: SAT_TOGGLES.find((x) => x.id === id)?.downloadKb ?? Number.NaN,
    })
    expect(downloadText(t('starlink'))).toBe('about 0.5 MB')
    expect(downloadText(t('debris'))).toBe('about 140 kB')
    expect(downloadText(t('stations'))).toBe('about 1 kB')
  })
})
