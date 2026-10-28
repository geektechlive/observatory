/**
 * Coastlines load their land data in a lazy chunk (#75): world-atlas land-110m was
 * about 21 kB gzip of first-load JavaScript, for a globe that WebGL replaces moments
 * later. The load starts at module import, so it runs alongside first paint.
 */
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Coastlines } from '@/components/globe/markers/Coastlines'
import { landRings } from '@/components/globe/markers/landRings'

afterEach(cleanup)

describe('Coastlines', () => {
  it('turns the land topology into [lat, lon] rings', async () => {
    const rings = await landRings()
    expect(rings.length).toBeGreaterThan(50)
    for (const ring of rings.slice(0, 5)) {
      for (const [lat, lon] of ring) {
        expect(Math.abs(lat)).toBeLessThanOrEqual(90)
        expect(Math.abs(lon)).toBeLessThanOrEqual(180)
      }
    }
  })

  it('draws the coastlines once the land data has loaded', async () => {
    const { container } = render(
      <svg>
        <Coastlines rotation={0} R={200} strokeColor="#000" fillColor="#111" />
      </svg>,
    )
    await waitFor(() => {
      expect(container.querySelectorAll('path').length).toBeGreaterThan(20)
    })
  })
})
