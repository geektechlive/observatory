/**
 * Links built from upstream data (USGS quakes, Spaceflight News) are https only (#249).
 * React 19 and the CSP already stop `javascript:`; this also keeps a spoofed or broken feed
 * from turning a headline into an http or other-scheme link.
 */
import { describe, expect, it } from 'vitest'

import { httpsHref } from '@/lib/httpsHref'

describe('httpsHref (#249)', () => {
  it('keeps an https URL', () => {
    expect(httpsHref('https://earthquake.usgs.gov/earthquakes/eventpage/us6000u18k')).toBe(
      'https://earthquake.usgs.gov/earthquakes/eventpage/us6000u18k',
    )
  })

  it('drops anything else, so the text shows without a link', () => {
    for (const bad of [
      'http://example.com/',
      'javascript:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,hi',
      '//evil.example/',
      'not a url',
      '',
      null,
      undefined,
    ]) {
      expect(httpsHref(bad), String(bad)).toBeUndefined()
    }
  })
})
