/**
 * The bezel's lane census (#51). A zero from a failed feed must never look like a
 * quiet Earth (Codex finding 12), so each lane resolves to one of five states.
 */
import { describe, expect, it } from 'vitest'

import { eventsByLane, laneCensus, type LayerStatus, layerStatus } from '@/lib/census'

const ok = (count: number): LayerStatus => ({
  enabled: true,
  loading: false,
  error: false,
  hasData: true,
  count,
})
const off: LayerStatus = { enabled: false, loading: false, error: false, hasData: false, count: 0 }

const byLane = (layers: Parameters<typeof laneCensus>[0]) =>
  Object.fromEntries(laneCensus(layers).map((l) => [l.lane, l]))

describe('laneCensus', () => {
  it('sums each lane from its layers and EONET kinds', () => {
    const lanes = byLane({
      satellites: ok(64),
      launches: ok(3),
      fires: ok(10),
      fireballs: ok(2),
      quakes: ok(7),
      events: { ...ok(5), byLane: { thermal: 2, geo: 1, hydro: 2 } },
    })
    expect(lanes['orbital']).toMatchObject({ state: 'live', count: 67 })
    expect(lanes['thermal']).toMatchObject({ state: 'live', count: 12 })
    expect(lanes['space']).toMatchObject({ state: 'live', count: 2 })
    expect(lanes['geo']).toMatchObject({ state: 'live', count: 8 })
    expect(lanes['hydro']).toMatchObject({ state: 'live', count: 2 })
  })

  it('is off when every layer feeding the lane is switched off', () => {
    expect(byLane({ fireballs: off })['space']).toMatchObject({ state: 'off', count: 0 })
  })

  it('is loading while an enabled layer has no data yet', () => {
    expect(byLane({ fireballs: { ...off, enabled: true, loading: true } })['space']?.state).toBe(
      'loading',
    )
  })

  it('is an error when an enabled layer failed with nothing to show', () => {
    expect(byLane({ fireballs: { ...off, enabled: true, error: true } })['space']?.state).toBe(
      'error',
    )
  })

  it('is stale when a refetch failed but older data is still drawn', () => {
    expect(byLane({ fireballs: { ...ok(2), error: true } })['space']).toMatchObject({
      state: 'stale',
      count: 2,
    })
  })

  it('is a true zero only when the feed answered and found nothing', () => {
    expect(byLane({ fireballs: ok(0) })['space']).toMatchObject({ state: 'zero', count: 0 })
  })

  it('an error in one layer outranks a healthy sibling in the same lane', () => {
    const lane = byLane({ satellites: ok(40), launches: { ...off, enabled: true, error: true } })[
      'orbital'
    ]
    expect(lane?.state).toBe('error')
    expect(lane?.count).toBe(40)
  })

  it('always returns the five lanes in palette order', () => {
    expect(laneCensus({}).map((l) => l.lane)).toEqual([
      'orbital',
      'thermal',
      'space',
      'geo',
      'hydro',
    ])
  })
})

describe('layerStatus', () => {
  it("adapts the hooks' { data, isLoading, error } shape", () => {
    expect(layerStatus({ isLoading: true, error: null, data: undefined }, true, 0)).toEqual({
      enabled: true,
      loading: true,
      error: false,
      hasData: false,
      count: 0,
    })
    expect(
      layerStatus({ isLoading: false, error: new Error('503'), data: { x: 1 } }, true, 4),
    ).toMatchObject({
      error: true,
      hasData: true,
      count: 4,
    })
  })
})

describe('eventsByLane', () => {
  it('splits EONET events across lanes by kind', () => {
    expect(
      eventsByLane([
        { kind: 'wildfires' },
        { kind: 'volcanoes' },
        { kind: 'floods' },
        { kind: 'earthquakes' },
      ]),
    ).toEqual({ thermal: 2, hydro: 1, geo: 1 })
  })
})
