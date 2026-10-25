/**
 * The Sun view's observation time (#73). SDO burns the time into the image, but the
 * stage zooms 1.12x so the round crop hides it; SDO's times files carry the same
 * stamp as text, e.g. "0171: 20261025_164622".
 */
import { describe, expect, it } from 'vitest'

import { formatObserved, observedAt, sdoStamp } from '@/lib/sdoTimes'

describe('sdoStamp', () => {
  it('reads an AIA times file', () => {
    expect(sdoStamp('0171: 20261025_164622\n')).toBe('2026-10-25T16:46:22Z')
  })

  it('reads the HMI times file, whose first stamp is the observation', () => {
    const hmi =
      'Time     20261025_161500\nIc  http://jsoc.stanford.edu/data/hmi/images/2026/10/25/20261025_161500_Ic\n'
    expect(sdoStamp(hmi)).toBe('2026-10-25T16:15:00Z')
  })

  it('rejects text with no stamp, or an impossible one', () => {
    expect(sdoStamp('<html>Not Found</html>')).toBeNull()
    expect(sdoStamp('0171: 20261399_256199')).toBeNull()
  })
})

describe('observedAt', () => {
  const times = {
    '0171': '2026-10-25T16:46:22Z',
    '0193': '2026-10-25T16:46:05Z',
    '0211': '2026-10-25T16:45:59Z',
    '0304': null,
    HMIB: '2026-10-25T16:15:00Z',
  }

  it('gives a single channel its own time', () => {
    expect(observedAt(times, '0171')).toBe('2026-10-25T16:46:22Z')
    expect(observedAt(times, 'HMIB')).toBe('2026-10-25T16:15:00Z')
  })

  it('gives the composite its oldest channel, so the label never claims newer data', () => {
    expect(observedAt(times, '211193171')).toBe('2026-10-25T16:45:59Z')
  })

  it('is null when the channel has no time', () => {
    expect(observedAt(times, '0304')).toBeNull()
    expect(observedAt({ ...times, '0193': null }, '211193171')).toBeNull()
    expect(observedAt(times, 'nope')).toBeNull()
  })
})

describe('formatObserved', () => {
  it('shows hours and minutes in UT', () => {
    expect(formatObserved('2026-10-25T06:05:59Z')).toBe('06:05 UT')
  })
})
