/**
 * ConsoleVoice wiring (#63): each console reads its own feeds and hands voiceFor()
 * the right fields. Hooks are mocked; voiceFor itself is covered in voice.test.ts.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConsoleVoice } from '@/components/consoles/ConsoleVoice'

const NOW = new Date('2026-10-19T12:00:00Z').getTime()
const ok = <T,>(data: T) => ({ data, isLoading: false, error: null })
const loading = { data: undefined, isLoading: true, error: null }

type Feeds = Record<
  'quakes' | 'wind' | 'activity' | 'sunMoon' | 'neo' | 'people' | 'launches',
  unknown
>
const state = vi.hoisted((): Feeds => ({
  quakes: null,
  wind: null,
  activity: null,
  sunMoon: null,
  neo: null,
  people: null,
  launches: null,
}))

vi.mock('@/hooks/useQuakes', () => ({ useQuakes: () => state.quakes }))
vi.mock('@/hooks/useSolarWind', () => ({ useSolarWind: () => state.wind }))
vi.mock('@/hooks/useSolarActivity', () => ({ useSolarActivity: () => state.activity }))
vi.mock('@/hooks/useSunMoon', () => ({ useSunMoon: () => state.sunMoon }))
vi.mock('@/hooks/useNeo', () => ({ useNeo: () => state.neo }))
vi.mock('@/hooks/usePeopleInSpace', () => ({ usePeopleInSpace: () => state.people }))
vi.mock('@/hooks/useLaunches', () => ({ useLaunches: () => state.launches }))
vi.mock('@/hooks/useNow', () => ({ useNow: () => new Date(NOW) }))

afterEach(cleanup)

const voice = () => document.querySelector('p')?.textContent ?? ''

describe('ConsoleVoice', () => {
  it('Earth: counts only the last 24 h of quakes above M5', () => {
    state.quakes = ok({
      quakes: [
        { mag: 6.1, place: 'off Honshu, Japan', time: NOW - 1000 },
        { mag: 5.4, place: 'Fiji region', time: NOW - 2000 },
        { mag: 7.0, place: 'Chile', time: NOW - 3 * 24 * 3600 * 1000 },
      ],
    })
    state.wind = ok({ currentKp: 2, windSpeed: 400 })
    render(<ConsoleVoice view="earth" />)
    expect(voice()).toMatch(/^Two quakes above M5/)
  })

  it('Earth: reads neutral while the seismic feed loads', () => {
    state.quakes = loading
    state.wind = loading
    render(<ConsoleVoice view="earth" />)
    expect(screen.getByText(/Reading the instruments/)).toBeTruthy()
  })

  it('Sun: reports the current X-ray class', () => {
    state.activity = ok({ xray: { currentClass: 'M1.2' } })
    state.wind = ok({ currentKp: 3, windSpeed: 620 })
    render(<ConsoleVoice view="sun" />)
    expect(voice()).toMatch(/M/)
    expect(voice().length).toBeGreaterThan(10)
  })

  it('Sky: uses the moon phase and the week of near-Earth objects', () => {
    state.sunMoon = ok({ curPhase: 'Waxing Gibbous', fracIllum: 78 })
    state.neo = ok({ element_count: 52 })
    render(<ConsoleVoice view="sky" />)
    expect(voice()).toMatch(/gibbous/i)
  })

  it('Orbit: people in orbit and the next launch, with or without a launch time', () => {
    state.people = ok({ number: 10 })
    state.launches = ok({
      result: [{ name: 'Falcon 9 | Starlink', t0: new Date(NOW + 5 * 3600 * 1000).toISOString() }],
    })
    render(<ConsoleVoice view="orbit" />)
    expect(voice()).toMatch(/ten|10/i)
    cleanup()

    state.launches = ok({ result: [{ name: 'TBD', t0: null, win_open: null }] })
    render(<ConsoleVoice view="orbit" />)
    expect(voice().length).toBeGreaterThan(10)
    cleanup()

    state.launches = ok({ result: [] })
    render(<ConsoleVoice view="orbit" />)
    expect(voice().length).toBeGreaterThan(10)
  })
})
