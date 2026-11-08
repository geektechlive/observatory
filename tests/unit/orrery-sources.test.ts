/**
 * The provider registry (#91, spec Phase 2): all 20 sources plus SatNOGS and Launch
 * Library 2, each with an honest status, and the fact-check's corrections recorded.
 */
import { describe, expect, it } from 'vitest'

import { SOURCE_STATUSES, SOURCES } from '@/lib/orrery/sources'

describe('SOURCES (#91)', () => {
  it('lists the spec’s 20 primary sources and the 2 optional ones', () => {
    expect(SOURCES.filter((s) => !s.optional)).toHaveLength(20)
    expect(SOURCES.filter((s) => s.optional).map((s) => s.id)).toEqual(['satnogs', 'll2'])
  })

  it('has unique ids and a known status for each', () => {
    const ids = SOURCES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of SOURCES) expect(SOURCE_STATUSES).toContain(s.status)
  })

  it('marks what this repo already uses as operational', () => {
    const op = SOURCES.filter((s) => s.status === 'operational').map((s) => s.id)
    for (const id of ['horizons', 'celestrak', 'neows', 'sentry', 'fireball']) {
      expect(op).toContain(id)
    }
  })

  it('marks what the refresh job now fetches for the orrery as operational (#92, #99)', () => {
    for (const id of ['cad', 'scout', 'neocc', 'sbdb_query']) {
      const s = SOURCES.find((x) => x.id === id)
      expect(s?.status).toBe('operational')
      expect(s?.note).toMatch(/refresh job/)
    }
  })

  it('says SBDB lookup is built and waits on the jpl-queue Worker (#100)', () => {
    const sbdb = SOURCES.find((s) => s.id === 'sbdb')
    expect(sbdb?.status).toBe('implemented')
    expect(sbdb?.plannedIn).toBe(100)
    expect(sbdb?.note).toMatch(/jpl-queue/)
  })

  it('marks the owner’s Space-Track and DISCOSweb accounts as operational (#101)', () => {
    for (const id of ['space-track', 'discosweb']) {
      const s = SOURCES.find((x) => x.id === id)
      expect(s?.status).toBe('operational')
      expect(s?.note).toMatch(/refresh job/)
    }
  })

  it('records the fact-check: sb_obs does not exist, Launch Library is 2.3.0', () => {
    const sbObs = SOURCES.find((s) => s.id === 'sb_obs')
    expect(sbObs?.status).toBe('unavailable')
    expect(sbObs?.note).toMatch(/404/)
    expect(SOURCES.find((s) => s.id === 'll2')?.url).toContain('2.3.0')
  })

  it('says Horizons now serves the orrery’s spacecraft (#93)', () => {
    const horizons = SOURCES.find((s) => s.id === 'horizons')
    expect(horizons?.status).toBe('operational')
    expect(horizons?.note).toMatch(/spacecraft/)
  })

  it('says which need an account or key', () => {
    expect(SOURCES.find((s) => s.id === 'space-track')?.auth).toBe('account')
    expect(SOURCES.find((s) => s.id === 'horizons')?.auth).toBe('none')
  })
})
