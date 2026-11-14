/**
 * The key one visitor is counted by: an IPv4 address whole, an IPv6 address by its /64 (a
 * client rotating inside its own /64 is one visitor). `::` is expanded first: taking the
 * first four parts of the compressed text kept host bits whenever `::` fell inside them
 * (2001:db8::1:2:3:4), so each address counted apart (#236 review). Used by the API rate
 * limit (functions/_middleware.ts) and the JPL queue's per-visitor cap (_jpl.ts).
 */
export function visitorKey(ip: string): string {
  if (!ip.includes(':')) return ip
  const [head = '', tail] = ip.toLowerCase().split('::')
  const left = head === '' ? [] : head.split(':')
  const right = tail === undefined || tail === '' ? [] : tail.split(':')
  const missing = tail === undefined ? 0 : 8 - left.length - right.length
  const parts = [...left, ...Array.from({ length: Math.max(0, missing) }, () => '0'), ...right]
  return parts
    .slice(0, 4)
    .map((p) => p.replace(/^0+(?=.)/, ''))
    .join(':')
}
