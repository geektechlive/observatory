/** The fly-in's camera flight (#261): four seconds from far out to arrival, slowing at the end. */
import { describe, expect, it } from 'vitest'

import { type Flight, FLIGHT_MS, flightAt } from '@/components/orrery/three/flight'

const f: Flight = { direction: [0, 0, 1], from: 6.7e8, to: 4, startMs: 1_000 }

describe('flightAt (#261)', () => {
  it('starts far out and arrives at the end of the flight', () => {
    expect(flightAt(f, 1_000)).toEqual({ distance: 6.7e8, done: false })
    expect(flightAt(f, 1_000 + FLIGHT_MS)).toEqual({ distance: 4, done: true })
    expect(flightAt(f, 1_000 + FLIGHT_MS * 2).done).toBe(true)
  })

  it('takes about four seconds', () => {
    expect(FLIGHT_MS).toBe(4_000)
  })

  it('covers the last tenth of its log distance slowly', () => {
    const late = flightAt(f, 1_000 + FLIGHT_MS * 0.9).distance
    // Nine-tenths of the way in time, the camera is within 2x of its arrival distance.
    expect(late / f.to).toBeLessThan(2)
  })
})
