/**
 * The inspector's button into the sky view (#99 item 5): it writes the sky link with the
 * orrery clock's moment, marks the history entry as opened from the orrery, and shows only
 * for objects the Tonight slice has (the sky view reads nothing else).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SmallBodyFacts } from '@/components/orrery/SmallBodyFacts'
import { asteroidEntries } from '@/lib/orrery/smallBodyView'
import { parseSkyLink } from '@/lib/sky/skyLink'
import type { CometsTonightData } from '@/schemas/cometsTonight'
import { useOrreryClock } from '@/store/orreryClock'

import fixture from './fixtures/tonight/c2024t5-kittpeak.json'

const query = vi.hoisted((): { result: { data: unknown; error: Error | null } } => ({
  result: { data: undefined, error: null },
}))
vi.mock('@/hooks/useCometsTonight', () => ({ useCometsTonight: () => query.result }))

const data: CometsTonightData = {
  generatedAt: '2026-11-07T00:15:00.000Z',
  frame: 'ecliptic-J2000',
  center: 'Sun',
  timeScale: 'TDB',
  provider: 'jpl-horizons',
  window: { fromJd: 2461350, toJd: 2461360 },
  comets: [],
  asteroids: [
    {
      id: 'sb:20000004',
      spkid: '20000004',
      name: '4 Vesta',
      h: 3.2,
      g: 0.32,
      gAssumed: false,
      elements: { epochJd: null, e: 0.09, q: 2.15, tp: 2458247.8, om: 103.8, w: 150.8, i: 7.14 },
      fine: fixture.comet.fine,
    },
  ],
}

const vestaEntry = () => {
  const entry = asteroidEntries(data)[0]
  if (!entry) throw new Error('no entry')
  return entry
}

beforeEach(() => {
  query.result = { data, error: null }
})

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  useOrreryClock.getState().resetToNow()
})

describe('SmallBodyFacts, sky view button', () => {
  it('opens the sky view on this object at the orrery clock’s moment, marked as from the orrery', () => {
    const scrubbed = Date.parse('2026-11-08T05:00:00Z')
    useOrreryClock.getState().pause()
    useOrreryClock.getState().setSimTime(scrubbed)
    render(<SmallBodyFacts entry={vestaEntry()} simMs={scrubbed} />)
    fireEvent.click(screen.getByRole('button', { name: /see it in your sky/i }))
    expect(parseSkyLink(window.location.hash)).toEqual({ target: 'sbc:20000004', t: scrubbed })
    expect(window.history.state).toEqual({ skyFrom: 'orrery' })
  })

  it('leaves the time out when the clock is at real time', () => {
    render(<SmallBodyFacts entry={vestaEntry()} simMs={Date.now()} />)
    fireEvent.click(screen.getByRole('button', { name: /see it in your sky/i }))
    expect(window.location.hash).toBe('#sky?target=sbc:20000004')
  })

  it('has no button, and says why, for an object that is not in the Tonight data', () => {
    const entry = vestaEntry()
    query.result = { data: { ...data, asteroids: [] }, error: null }
    render(<SmallBodyFacts entry={entry} simMs={Date.now()} />)
    expect(screen.queryByRole('button', { name: /see it in your sky/i })).toBeNull()
    expect(screen.getByText(/not in this week’s Tonight list/i)).toBeTruthy()
  })

  it('shows nothing about the sky view while the Tonight data loads', () => {
    query.result = { data: undefined, error: null }
    render(<SmallBodyFacts entry={vestaEntry()} simMs={Date.now()} />)
    expect(screen.queryByRole('button', { name: /see it in your sky/i })).toBeNull()
    expect(screen.queryByText(/not in this week’s Tonight list/i)).toBeNull()
  })
})
