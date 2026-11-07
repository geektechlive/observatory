import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useLookupStore } from '@/components/orrery/lookupStore'
import { SearchBox } from '@/components/orrery/SearchBox'
import { parseSbdbLookup } from '@/lib/orrery/jplLookup'
import { useOrreryClock } from '@/store/orreryClock'

import apophis from './fixtures/jpl-lookup/sbdb-apophis.json'
import halley from './fixtures/jpl-lookup/sbdb-halley.json'

// The orrery search's fallback to JPL (#100): a name the orrery doesn't carry is looked
// up on demand in JPL's Small-Body Database, with its position from Horizons.

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useLookupStore.getState().clear()
})

beforeEach(() => {
  useOrreryClock.getState().pause()
  useOrreryClock.getState().setSimTime(Date.parse('2026-11-02T00:00:00Z'))
})

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const lookupBody = (raw: unknown, query: string) => ({
  query,
  provider: 'jpl-sbdb',
  result: parseSbdbLookup(raw),
})

const apophisObject = (() => {
  const r = parseSbdbLookup(apophis)
  if (r?.type !== 'object') throw new Error('fixture')
  return r.object
})()

const trajectory = {
  generatedAt: '2026-11-07T00:00:00Z',
  frame: 'ecliptic-J2000',
  center: 'Sun',
  timeScale: 'TDB',
  units: { position: 'au', velocity: 'au/day' },
  sourceType: 'ephemeris',
  provider: 'jpl-horizons',
  object: apophisObject,
  target: '99942 Apophis (2004 MN4)',
  request: { start: '2026-11-01', end: '2026-11-03', stepMinutes: 1440 },
  fine: {
    start: 2461345.5,
    step: 1,
    samples: [
      0.5, -0.8, 0.01, 0.015, 0.01, 0, 0.51, -0.79, 0.01, 0.015, 0.01, 0, 0.52, -0.78, 0.01, 0.015,
      0.01, 0,
    ],
  },
  availableFrom: null,
  availableTo: null,
}

function stubApi(routes: Record<string, () => Response>) {
  const fetch = vi.fn(async (url: string) => {
    const path = new URL(url, 'https://o.test').pathname
    const route = routes[path]
    return route ? route() : new Response('{}', { status: 404 })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers })

function searchFor(text: string) {
  const box = screen.getByRole('combobox', { name: /find/i })
  fireEvent.change(box, { target: { value: text } })
  return box
}

describe('SearchBox: JPL fallback (#100)', () => {
  it('offers JPL only when nothing in the orrery matches', () => {
    wrap(<SearchBox onSelect={vi.fn()} />)
    searchFor('mars')
    expect(screen.queryByRole('option', { name: /search jpl/i })).toBeNull()
    searchFor('apophis')
    expect(screen.getByRole('option', { name: 'Search JPL for “apophis”' })).toBeDefined()
    searchFor('<x>')
    expect(screen.queryByRole('option', { name: /search jpl/i })).toBeNull()
  })

  it('looks the name up and shows what JPL says, with where it is', async () => {
    const fetch = stubApi({
      '/api/lookup': () => json(lookupBody(apophis, 'apophis')),
      '/api/trajectory': () => json(trajectory),
    })
    const onSelect = vi.fn()
    wrap(<SearchBox onSelect={onSelect} />)
    const box = searchFor('apophis')
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled()

    const card = await screen.findByRole('region', { name: /jpl lookup/i })
    expect(await screen.findByText('99942 Apophis (2004 MN4)')).toBeDefined()
    expect(card.textContent).toContain('Asteroid · Aten')
    expect(card.textContent).toContain('Potentially hazardous')
    expect(await screen.findByText(/from the Sun/)).toBeDefined()
    expect(screen.getByRole('button', { name: 'Show in orrery' })).toBeDefined()
    expect(fetch).toHaveBeenCalledWith('/api/lookup?q=apophis', undefined)
    expect(fetch.mock.calls.some(([u]) => u.startsWith('/api/trajectory?id=sb%3A20099942'))).toBe(
      true,
    )
  })

  it('lists several matches and looks up the one chosen', async () => {
    const fetch = stubApi({
      '/api/lookup': () => json(lookupBody(halley, 'halley')),
    })
    wrap(<SearchBox onSelect={vi.fn()} />)
    fireEvent.keyDown(searchFor('halley'), { key: 'Enter' })
    const pick = await screen.findByRole('button', { name: '1P/Halley' })
    fireEvent.click(pick)
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/lookup?q=1P', undefined)
    })
  })

  it('says plainly when lookup is not set up or JPL is busy', async () => {
    stubApi({
      '/api/lookup': () => json({ error: 'x' }, 503, { 'X-Not-Configured': 'jpl-queue' }),
    })
    wrap(<SearchBox onSelect={vi.fn()} />)
    fireEvent.keyDown(searchFor('apophis'), { key: 'Enter' })
    expect(await screen.findByText(/isn’t available yet/)).toBeDefined()
    cleanup()

    stubApi({ '/api/lookup': () => json({ error: 'x' }, 503) })
    wrap(<SearchBox onSelect={vi.fn()} />)
    fireEvent.keyDown(searchFor('apophis'), { key: 'Enter' })
    expect(await screen.findByText(/JPL is busy/)).toBeDefined()
  })

  it('"Show in orrery" hands the object to the orrery, and Remove takes it back (#145)', async () => {
    stubApi({
      '/api/lookup': () => json(lookupBody(apophis, 'apophis')),
      '/api/trajectory': () => json(trajectory),
    })
    wrap(<SearchBox onSelect={vi.fn()} />)
    fireEvent.keyDown(searchFor('apophis'), { key: 'Enter' })
    fireEvent.click(await screen.findByRole('button', { name: 'Show in orrery' }))
    expect(useLookupStore.getState().shown).toEqual({
      spkid: '20099942',
      object: apophisObject,
      focusOnLoad: true,
    })
    expect(screen.queryByRole('button', { name: 'Show in orrery' })).toBeNull()
    expect(screen.getByText(/shown in the orrery/i)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Remove from orrery' }))
    expect(useLookupStore.getState().shown).toBeNull()
    expect(screen.getByRole('button', { name: 'Show in orrery' })).toBeDefined()
  })

  it('says when JPL has no such object (#145)', async () => {
    stubApi({ '/api/lookup': () => json({ error: 'x' }, 404) })
    wrap(<SearchBox onSelect={vi.fn()} />)
    fireEvent.keyDown(searchFor('apophis'), { key: 'Enter' })
    expect(await screen.findByText(/JPL has no object/)).toBeDefined()
  })

  it('closes the card', async () => {
    stubApi({ '/api/lookup': () => json(lookupBody({ code: '200', message: 'not found' }, 'zzz')) })
    wrap(<SearchBox onSelect={vi.fn()} />)
    fireEvent.keyDown(searchFor('zzzq'), { key: 'Enter' })
    expect(await screen.findByText(/has nothing called “zzzq”/)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('region', { name: /jpl lookup/i })).toBeNull()
  })
})
