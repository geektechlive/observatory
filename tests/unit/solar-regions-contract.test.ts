/**
 * The solar-regions content contract (#210, ADR 0004). Its own file, so parallel work on
 * health.test.ts doesn't collide with it.
 */
import { describe, expect, it } from 'vitest'

import { evaluateSource, SOURCES, VIEW_HEADLINES } from '@/lib/health'

const FRESH = { degraded: false, dataAgeSeconds: null }

const PROBABILITIES = { issued: '2026-11-11', forDate: '2026-11-12', c: 90, m: 45, x: 5, proton: 5 }
const REGIONS = { observedDate: '2026-11-11', validAt: '2026-11-12T00:00:00Z', items: [] }

describe('the solar-regions contract', () => {
  it('is not a headline source: it sits below the fold on one view (ADR 0018)', () => {
    expect(SOURCES['solar-regions'].headline).toBe(false)
    expect(VIEW_HEADLINES.sun).not.toContain('solar-regions')
  })

  it('passes a full answer, including a day with no sunspot regions', () => {
    const data = { probabilities: PROBABILITIES, regions: REGIONS, updatedAt: 'now' }
    expect(evaluateSource('solar-regions', data, FRESH)).toBe('ok')
  })

  it('grades a half answer degraded, not error: the panel can still show it', () => {
    const half = { probabilities: PROBABILITIES, regions: null, updatedAt: 'now' }
    expect(evaluateSource('solar-regions', half, { degraded: true, dataAgeSeconds: null })).toBe(
      'degraded',
    )
  })

  it('fails an answer with neither half, or a regions half without a list', () => {
    expect(evaluateSource('solar-regions', { probabilities: null, regions: null }, FRESH)).toBe(
      'error',
    )
    expect(
      evaluateSource('solar-regions', { probabilities: null, regions: { validAt: 'x' } }, FRESH),
    ).toBe('error')
    expect(evaluateSource('solar-regions', {}, FRESH)).toBe('error')
    expect(evaluateSource('solar-regions', null, FRESH)).toBe('error')
  })
})
