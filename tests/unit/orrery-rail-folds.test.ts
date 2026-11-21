import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  countReadout,
  foldOpen,
  FOLDS_STORAGE_KEY,
  rememberFold,
  resetFoldMemory,
  revealNote,
} from '@/components/orrery/railFolds'

beforeEach(() => {
  localStorage.clear()
  resetFoldMemory()
})
afterEach(() => {
  vi.restoreAllMocks()
})

// The rail folds its layer groups (#273): Solar system and Spacecraft open at first.
describe('fold state (#273)', () => {
  it('opens Solar system and Spacecraft at first, folds the rest', () => {
    expect(foldOpen('solar')).toBe(true)
    expect(foldOpen('craft')).toBe(true)
    expect(foldOpen('small')).toBe(false)
    expect(foldOpen('near')).toBe(false)
    expect(foldOpen('orbit')).toBe(false)
  })

  it('remembers a visitor’s choice between visits', () => {
    rememberFold('orbit', true)
    rememberFold('solar', false)
    resetFoldMemory()
    expect(foldOpen('orbit')).toBe(true)
    expect(foldOpen('solar')).toBe(false)
    expect(JSON.parse(localStorage.getItem(FOLDS_STORAGE_KEY) ?? '{}')).toEqual({
      orbit: true,
      solar: false,
    })
  })

  it('ignores a corrupt or foreign stored value', () => {
    localStorage.setItem(FOLDS_STORAGE_KEY, '{nope')
    expect(foldOpen('solar')).toBe(true)
    localStorage.setItem(FOLDS_STORAGE_KEY, JSON.stringify({ small: 'yes', near: true }))
    expect(foldOpen('small')).toBe(false)
    expect(foldOpen('near')).toBe(true)
  })

  it('keeps working for the session when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(foldOpen('craft')).toBe(true)
    expect(() => {
      rememberFold('craft', false)
    }).not.toThrow()
    expect(foldOpen('craft')).toBe(false)
  })
})

describe('readouts and reveal notes (#273)', () => {
  it('says Off or how many are on', () => {
    expect(countReadout(0, 3)).toBe('Off')
    expect(countReadout(2, 3)).toBe('2 of 3 on')
    expect(countReadout(7, 7)).toBe('7 of 7 on')
  })

  it('names what was switched on, briefly', () => {
    expect(revealNote(['Space stations'])).toBe('Space stations switched on')
    expect(revealNote(['Comets', 'Dwarf planets'])).toBe('Comets and Dwarf planets switched on')
    expect(revealNote(['Starlink', 'GPS', 'Weather', 'Debris'])).toBe(
      'Starlink, GPS and 2 more switched on',
    )
  })
})
