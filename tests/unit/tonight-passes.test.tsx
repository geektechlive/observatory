/**
 * Visible ISS passes in the Tonight panel (#81). The TLE and the expected pass are
 * from Heavens-Above (see iss-passes.test.ts): 28 Oct, 11:38:38 to 11:43:35 UTC,
 * up to 19°, NNW to ENE, from Kansas City.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TonightPanel } from '@/components/panels/TonightPanel'
import { useUiStore } from '@/store/ui'

const TLE = {
  name: 'ISS (ZARYA)',
  line1: '1 25544U 98067A   26300.17675415  .00005704  00000+0  11132-3 0  9993',
  line2: '2 25544  51.6336   6.9404 0006948 314.9066  45.1358 15.49073103592213',
}
const state = vi.hoisted((): { now: Date; tle: unknown } => ({
  now: new Date('2026-10-28T09:00:00Z'),
  tle: { data: undefined },
}))

vi.mock('@/hooks/useNow', () => ({ useNow: () => state.now }))
vi.mock('@/hooks/useIssTle', () => ({ useIssTle: () => state.tle }))
vi.mock('@/hooks/useSunMoon', () => ({ useSunMoon: () => ({ data: undefined }) }))
vi.mock('@/hooks/useClouds', () => ({ useClouds: () => ({ data: undefined }) }))
vi.mock('@/hooks/useAurora', () => ({ useAurora: () => ({ data: undefined }) }))
vi.mock('@/hooks/useSolarCycle', () => ({ useSolarCycle: () => ({ data: undefined }) }))

afterEach(() => {
  cleanup()
  useUiStore.setState({ observer: null, geoStatus: null })
  state.tle = { data: undefined }
  state.now = new Date('2026-10-28T09:00:00Z')
})

describe('TonightPanel ISS passes (#81)', () => {
  it('lists the visible passes in the next twelve hours, with where to look', () => {
    state.tle = { data: TLE }
    useUiStore.setState({ observer: { lat: 39.1, lon: -94.6, isFallback: false } })
    render(<TonightPanel />)
    const pass = screen.getByText(/up to 19°/)
    expect(pass.textContent).toMatch(/NNW → ENE/)
    expect(document.body.textContent).toMatch(/orbit data \d+ h old/i)
  })

  it('says so when no pass is visible', () => {
    state.tle = { data: TLE }
    state.now = new Date('2026-10-28T12:00:00Z')
    useUiStore.setState({ observer: { lat: 39.1, lon: -94.6, isFallback: false } })
    render(<TonightPanel />)
    expect(screen.getByText(/no visible ISS passes in the next 12 hours/i)).toBeTruthy()
  })

  it('shows no pass section until the orbit data arrives', () => {
    useUiStore.setState({ observer: { lat: 39.1, lon: -94.6, isFallback: false } })
    render(<TonightPanel />)
    expect(document.body.textContent).not.toMatch(/ISS/)
  })
})
