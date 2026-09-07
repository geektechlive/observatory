import { describe, expect, it } from 'vitest'

import { epicImageUrl } from '@/lib/epicUrl'

describe('epicImageUrl', () => {
  const valid = { image: 'epic_1b_20260904002712', date: '2026-09-04 00:27:12' }

  it('builds the jpg archive URL for a valid 1b image name', () => {
    expect(epicImageUrl(valid, 'jpg')).toBe(
      'https://epic.gsfc.nasa.gov/archive/natural/2026/09/04/jpg/epic_1b_20260904002712.jpg',
    )
  })

  it('builds the png archive URL for a valid image name', () => {
    expect(epicImageUrl(valid, 'png')).toBe(
      'https://epic.gsfc.nasa.gov/archive/natural/2026/09/04/png/epic_1b_20260904002712.png',
    )
  })

  it('defaults to jpg when no format is passed', () => {
    expect(epicImageUrl(valid)).toBe(
      'https://epic.gsfc.nasa.gov/archive/natural/2026/09/04/jpg/epic_1b_20260904002712.jpg',
    )
  })

  it('accepts the RGB variant name', () => {
    const rgb = { image: 'epic_RGB_20260904002712', date: '2026-09-04 00:27:12' }
    expect(epicImageUrl(rgb, 'jpg')).toBe(
      'https://epic.gsfc.nasa.gov/archive/natural/2026/09/04/jpg/epic_RGB_20260904002712.jpg',
    )
  })

  it('returns null for a path-traversal attempt', () => {
    expect(epicImageUrl({ image: '../x', date: '2026-09-04 00:27:12' })).toBeNull()
  })

  it('returns null for a truncated timestamp', () => {
    expect(epicImageUrl({ image: 'epic_1b_2026', date: '2026-09-04 00:27:12' })).toBeNull()
  })

  it('returns null for an empty image name', () => {
    expect(epicImageUrl({ image: '', date: '2026-09-04 00:27:12' })).toBeNull()
  })
})
