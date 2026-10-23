import { describe, expect, it } from 'vitest'

import { type Feed, voiceFor, type VoiceInput } from '@/lib/voice'

const ok = <T>(data: T): Feed<T> => ({ state: 'ok', data })
const loading = { state: 'loading' } as const
const error = { state: 'error' } as const

const quake = (mag: number | null, place = 'Somewhere quiet') => ({ mag, place })
const pacific = 'near the coast of Honshu, Japan'

function input(overrides: Partial<VoiceInput> = {}): VoiceInput {
  return {
    quakes: ok([]),
    kp: ok({ value: 2 }),
    xray: ok({ currentClass: 'B2.1', peakClass24h: 'B4.0' }),
    wind: ok({ speedKmS: 384 }),
    moon: ok({ phase: 'waxing crescent', illuminationPct: 23 }),
    neo: ok({ countThisWeek: 4 }),
    people: ok({ count: 11 }),
    launch: ok({ name: 'Starship Flight 12', hoursUntil: 72 }),
    ...overrides,
  }
}

describe('voiceFor earth', () => {
  it('says nothing false while loading', () => {
    expect(voiceFor('earth', input({ quakes: loading }))).toBe('Reading the instruments…')
  })

  it('is honest when the seismic feed is down', () => {
    expect(voiceFor('earth', input({ quakes: error }))).toBe(
      'Seismic feed is down; the rest of the Earth console is live.',
    )
  })

  it('reports a quiet day', () => {
    expect(voiceFor('earth', input())).toBe('No quakes above M5 today.')
  })

  it('uses singular and plural correctly', () => {
    expect(voiceFor('earth', input({ quakes: ok([quake(5.2)]) }))).toBe('One quake above M5 today.')
    expect(voiceFor('earth', input({ quakes: ok([quake(5.2), quake(6)]) }))).toBe(
      'Two quakes above M5 today.',
    )
  })

  it('counts M5.0 but not M4.9, and ignores null magnitudes', () => {
    expect(voiceFor('earth', input({ quakes: ok([quake(4.9), quake(null)]) }))).toBe(
      'No quakes above M5 today.',
    )
    expect(voiceFor('earth', input({ quakes: ok([quake(5.0)]) }))).toContain('One quake')
  })

  it('switches to digits above ten', () => {
    const many = Array.from({ length: 12 }, () => quake(5.5))
    expect(voiceFor('earth', input({ quakes: ok(many) }))).toBe('12 quakes above M5 today.')
  })

  it('adds the Pacific rim only when most big quakes match', () => {
    const rim = [
      quake(5.1, pacific),
      quake(5.5, '10 km of Kandilli, Indonesia'),
      quake(6, 'Iceland'),
    ]
    expect(voiceFor('earth', input({ quakes: ok(rim) }))).toBe(
      'Three quakes above M5 along the Pacific rim.',
    )
    const mixed = [quake(5.1, pacific), quake(5.5, 'Iceland'), quake(6, 'Greece')]
    expect(voiceFor('earth', input({ quakes: ok(mixed) }))).toBe('Three quakes above M5 today.')
  })

  it('adds the aurora clause at Kp 4 but not 3.99', () => {
    const q = ok([quake(5.1, pacific), quake(5.5, pacific), quake(6, pacific)])
    expect(voiceFor('earth', input({ quakes: q, kp: ok({ value: 4 }) }))).toBe(
      'Three quakes above M5 along the Pacific rim, and the aurora may be visible at high latitudes.',
    )
    expect(voiceFor('earth', input({ quakes: q, kp: ok({ value: 3.99 }) }))).toBe(
      'Three quakes above M5 along the Pacific rim.',
    )
  })

  it('names a storm at Kp 5 and omits the clause when Kp failed', () => {
    expect(voiceFor('earth', input({ kp: ok({ value: 5 }) }))).toBe(
      'No quakes above M5 today, and a geomagnetic storm is under way.',
    )
    expect(voiceFor('earth', input({ kp: error }))).toBe('No quakes above M5 today.')
    expect(voiceFor('earth', input({ kp: ok({ value: null }) }))).toBe('No quakes above M5 today.')
  })
})

describe('voiceFor sun', () => {
  it('is neutral while loading and honest on error', () => {
    expect(voiceFor('sun', input({ xray: loading }))).toBe('Reading the instruments…')
    expect(voiceFor('sun', input({ xray: error }))).toBe(
      'Solar X-ray feed is down; the rest of the Sun console is live.',
    )
  })

  it('describes a quiet Sun with wind', () => {
    expect(voiceFor('sun', input())).toBe('The Sun is quiet: B-class X-rays and a 384 km/s wind.')
  })

  it('omits wind when it is unavailable', () => {
    expect(voiceFor('sun', input({ wind: error }))).toBe('The Sun is quiet: B-class X-rays.')
  })

  it('reports an M or X flare in the last day', () => {
    const xray = ok({ currentClass: 'C1.0', peakClass24h: 'M2.3' })
    expect(voiceFor('sun', input({ xray, wind: ok({ speedKmS: 620 }) }))).toBe(
      'An M-class flare in the last day, and the wind is at 620 km/s.',
    )
    const x = ok({ currentClass: 'X1.0', peakClass24h: 'X1.0' })
    expect(voiceFor('sun', input({ xray: x }))).toBe(
      'An X-class flare in the last day, and the wind is at 384 km/s.',
    )
  })

  it('does not claim quiet with no class reading', () => {
    const xray = ok({ currentClass: null, peakClass24h: null })
    expect(voiceFor('sun', input({ xray }))).toBe('No X-ray class is reported right now.')
  })
})

describe('voiceFor sky', () => {
  it('handles loading and error', () => {
    expect(voiceFor('sky', input({ moon: loading }))).toBe('Reading the instruments…')
    expect(voiceFor('sky', input({ moon: error }))).toBe(
      'Moon data is down; the rest of the Sky console is live.',
    )
  })

  it('combines moon and asteroids with correct number', () => {
    expect(voiceFor('sky', input())).toBe(
      'The Moon is waxing crescent, 23% lit, and four near-Earth asteroids approach this week.',
    )
    expect(voiceFor('sky', input({ neo: ok({ countThisWeek: 1 }) }))).toBe(
      'The Moon is waxing crescent, 23% lit, and one near-Earth asteroid approaches this week.',
    )
    expect(voiceFor('sky', input({ neo: ok({ countThisWeek: 0 }) }))).toBe(
      'The Moon is waxing crescent, 23% lit, and no near-Earth asteroids approach this week.',
    )
  })

  it('reads each USNO phase name as English', () => {
    const say = (phase: string) =>
      voiceFor('sky', input({ moon: ok({ phase, illuminationPct: 50 }), neo: error }))
    expect(say('First Quarter')).toBe('The Moon is at first quarter, 50% lit.')
    expect(say('Last Quarter')).toBe('The Moon is at last quarter, 50% lit.')
    expect(say('Third Quarter')).toBe('The Moon is at last quarter, 50% lit.')
    expect(say('Full Moon')).toBe('The Moon is full, 50% lit.')
    expect(say('New Moon')).toBe('The Moon is new, 50% lit.')
    expect(say('Waning Gibbous')).toBe('The Moon is waning gibbous, 50% lit.')
  })

  it('omits the asteroid clause when that feed failed', () => {
    expect(voiceFor('sky', input({ neo: error }))).toBe('The Moon is waxing crescent, 23% lit.')
  })
})

describe('voiceFor orbit', () => {
  it('handles loading and error', () => {
    expect(voiceFor('orbit', input({ people: loading }))).toBe('Reading the instruments…')
    expect(voiceFor('orbit', input({ people: error }))).toBe(
      'Crew roster is down; the rest of the Orbit console is live.',
    )
  })

  it('counts people and says the next launch in words', () => {
    expect(voiceFor('orbit', input())).toBe(
      '11 people are in space, and the next launch, Starship Flight 12, is in 3 days.',
    )
    expect(voiceFor('orbit', input({ people: ok({ count: 7 }) }))).toContain('Seven people')
    expect(voiceFor('orbit', input({ people: ok({ count: 1 }) }))).toContain('One person is')
  })

  it('phrases short countdowns', () => {
    const at = (hoursUntil: number) =>
      voiceFor('orbit', input({ launch: ok({ name: 'Vulcan', hoursUntil }) }))
    expect(at(0.5)).toContain('is in under an hour.')
    expect(at(1)).toContain('is in 1 hour.')
    expect(at(5)).toContain('is in 5 hours.')
    expect(at(24)).toContain('is in 1 day.')
  })

  it('omits the launch when unknown or past', () => {
    expect(voiceFor('orbit', input({ launch: error }))).toBe('11 people are in space.')
    expect(voiceFor('orbit', input({ launch: ok({ name: null, hoursUntil: null }) }))).toBe(
      '11 people are in space.',
    )
    expect(voiceFor('orbit', input({ launch: ok({ name: 'X', hoursUntil: -2 }) }))).toBe(
      '11 people are in space.',
    )
  })
})
