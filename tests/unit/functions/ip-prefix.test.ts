/**
 * One visitor per IPv4 address or IPv6 /64 (#236 review): the rate limit and the JPL cap
 * took the first four colon-separated parts of the *compressed* address, so when `::` fell
 * inside them (2001:db8::1:2:3:4) the key carried host bits and each address counted apart.
 */
import { describe, expect, it } from 'vitest'

import { visitorKey } from '../../../functions/api/_ip'

describe('visitorKey', () => {
  it('keeps an IPv4 address whole', () => {
    expect(visitorKey('203.0.113.7')).toBe('203.0.113.7')
  })

  it('keys an IPv6 address by its /64, expanding :: first', () => {
    expect(visitorKey('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2')
    expect(visitorKey('2001:db8::1:2:3:4')).toBe('2001:db8:0:0')
    expect(visitorKey('2001:db8::5:6:7:8')).toBe(visitorKey('2001:db8::1:2:3:4'))
    expect(visitorKey('2001:DB8:0:0:1::')).toBe('2001:db8:0:0')
    expect(visitorKey('::1')).toBe('0:0:0:0')
  })
})
