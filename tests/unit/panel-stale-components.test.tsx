/**
 * Two converted panels at the component level (#222): CO₂ keeps its reading when the query
 * holds data and an error, and Sun & Moon shows its age, which an exact-key cache lookup
 * of ['sun-moon'] never found (the real key carries place and date).
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Co2Panel } from '@/components/panels/Co2Panel'
import { SunMoonPanel } from '@/components/panels/SunMoonPanel'
import type { Co2 } from '@/schemas/co2'
import type { SunMoon } from '@/schemas/sunMoon'

const MINUTE = 60_000

interface Query<T> {
  data: T | undefined
  isLoading: boolean
  error: Error | null
  dataUpdatedAt: number
}
const co2 = vi.hoisted((): Query<Co2> => ({
  data: undefined,
  isLoading: false,
  error: null,
  dataUpdatedAt: 0,
}))
const sunMoon = vi.hoisted((): Query<SunMoon> => ({
  data: undefined,
  isLoading: false,
  error: null,
  dataUpdatedAt: 0,
}))

vi.mock('@/hooks/useCo2', () => ({ useCo2: () => co2 }))
vi.mock('@/hooks/useSunMoon', () => ({
  useSunMoon: () => ({
    ...sunMoon,
    isFallbackLocation: false,
    geoStatus: 'granted',
    requestLocation: () => undefined,
  }),
}))

afterEach(() => {
  cleanup()
  for (const q of [co2, sunMoon] as Query<unknown>[]) {
    q.data = undefined
    q.error = null
    q.dataUpdatedAt = 0
  }
})

describe('Co2Panel with a failed refetch', () => {
  it('keeps the reading and marks it, instead of "Data unavailable"', () => {
    co2.data = {
      ppm: 428.25,
      date: '2026-11-07',
      yearAgo: 426.52,
      updatedAt: new Date(Date.now() - 10 * MINUTE).toISOString(),
    }
    co2.error = new Error('503')
    render(<Co2Panel />)
    expect(screen.getByText('428.3')).toBeTruthy()
    expect(screen.getByText("couldn't refresh")).toBeTruthy()
    expect(screen.queryByText('Data unavailable')).toBeNull()
  })
})

describe('SunMoonPanel age stamp', () => {
  it("shows the age of its data, read from the data's own updatedAt", () => {
    sunMoon.data = {
      date: '2026-11-12',
      tz: 0,
      lat: 0,
      lon: 0,
      curPhase: 'Waxing Gibbous',
      fracIllum: 70,
      closestPhase: null,
      sun: { rise: null, set: null, transit: null, civilBegin: null, civilEnd: null },
      moon: { rise: null, set: null },
      updatedAt: new Date(Date.now() - 5 * MINUTE).toISOString(),
    }
    render(<SunMoonPanel />)
    expect(screen.getByText('5m ago')).toBeTruthy()
  })
})
