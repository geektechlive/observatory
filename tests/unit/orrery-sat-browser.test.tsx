/**
 * The satellite browser panel (#158): lists that need no names, a filter, a switched-off
 * group that offers its switch with the download size, Space-Track lists that wait for
 * an explicit load, and a row that chooses the satellite.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SatBrowser, type SatBrowserProps } from '@/components/orrery/SatBrowser'
import { SatControls } from '@/components/orrery/SatControls'
import { ALL_SAT_TOGGLES_ON, DEFAULT_SAT_TOGGLES } from '@/components/orrery/satToggles'
import type { SatFieldInfo } from '@/lib/orbit/bulk/satHandler'
import { ORBIT_GEO, ORBIT_LEO, ORBIT_MEO } from '@/lib/orbit/orbitClass'
import { SAT_GROUPS, type SatGroupId } from '@/lib/orbit/satCatalog'

const fetchSatcatShard = vi.fn()
vi.mock('@/lib/api/spaceTrack', () => ({
  fetchSatcatShard: (shard: number) => fetchSatcatShard(shard) as Promise<unknown>,
}))

afterEach(cleanup)
beforeEach(() => {
  // jsdom has no layout: opening the browser scrolls it into view.
  Element.prototype.scrollIntoView = vi.fn()
  fetchSatcatShard.mockReset()
})

const T0 = Date.parse('2026-11-08T12:00:00Z')

const OBJECTS: { id: string; name: string; group: SatGroupId; orbit: number; launch: number }[] = [
  { id: '25544', name: 'ISS (ZARYA)', group: 'stations', orbit: ORBIT_LEO, launch: 1998067 },
  { id: '40001', name: 'GPS BIIF-1', group: 'gps-ops', orbit: ORBIT_MEO, launch: 2010022 },
  { id: '41001', name: 'GOES 16', group: 'weather', orbit: ORBIT_GEO, launch: 2016071 },
  { id: '43001', name: 'OTHER-1', group: 'other', orbit: ORBIT_LEO, launch: 2026120 },
]

function field(): SatFieldInfo {
  const groups = OBJECTS.map((o, i) => ({ group: o.group, start: i, count: 1 }))
  return {
    version: 1,
    groups,
    ids: OBJECTS.map((o) => o.id),
    names: OBJECTS.map((o) => o.name),
    epochMs: new Float64Array(OBJECTS.length).fill(T0),
    orbit: Uint8Array.from(OBJECTS.map((o) => o.orbit)),
    launch: Int32Array.from(OBJECTS.map((o) => o.launch)),
  }
}

const props = (patch: Partial<SatBrowserProps> = {}): SatBrowserProps => ({
  field: field(),
  toggles: DEFAULT_SAT_TOGGLES,
  onToggles: () => undefined,
  groups: {},
  reentries: [],
  reentryNames: {},
  reentriesAvailable: true,
  onChoose: () => undefined,
  onOpenOrbit: () => undefined,
  ...patch,
})

function show(p: SatBrowserProps): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <SatBrowser {...p} />
    </QueryClientProvider>
  )
  return render(ui)
}

const rows = () =>
  screen
    .queryAllByRole('listitem')
    .map((li) => li.textContent)
    .filter(Boolean)

describe('<SatBrowser> (#158)', () => {
  it('lists what is loaded, and chooses a satellite from its row', () => {
    const onChoose = vi.fn()
    show(props({ onChoose }))
    expect(rows()).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: /GOES 16/ }))
    expect(onChoose).toHaveBeenCalledWith('sat:41001')
  })

  it('filters by name or NORAD id', () => {
    show(props())
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'gps' } })
    expect(rows()).toHaveLength(1)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '41001' } })
    expect(rows()[0]).toMatch(/GOES 16/)
  })

  it('says in a line what each list is', () => {
    show(props())
    const pick = screen.getByRole('combobox', { name: 'Browse by' })
    fireEvent.change(pick, { target: { value: 'newest' } })
    expect(screen.getByText(/year and launch number/)).toBeTruthy()
    expect(rows()[0]).toMatch(/OTHER-1/)
  })

  it('lists an orbit class', () => {
    show(props())
    fireEvent.change(screen.getByRole('combobox', { name: 'Browse by' }), {
      target: { value: 'orbit' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Orbit' }), {
      target: { value: 'geo' },
    })
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toMatch(/GOES 16/)
  })

  it('offers the switch, with the download size, for a group that is off', () => {
    const onToggles = vi.fn()
    show(props({ onToggles }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Browse by' }), {
      target: { value: 'kind' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Kind' }), {
      target: { value: 'starlink' },
    })
    expect(rows()).toHaveLength(0)
    const turnOn = screen.getByRole('button', { name: /Turn on Starlink/ })
    expect(turnOn.textContent).toMatch(/about 0\.5 MB/)
    fireEvent.click(turnOn)
    expect(onToggles).toHaveBeenCalledWith({ ...DEFAULT_SAT_TOGGLES, starlink: true })
  })

  it('names the groups that are off under any list, each with a switch', () => {
    show(props())
    const off = screen.getByRole('group', { name: 'Switched off' })
    expect(within(off).getByRole('button', { name: /Turn on Debris/ })).toBeTruthy()
    expect(within(off).getByRole('button', { name: /Turn on Starlink/ })).toBeTruthy()
  })

  it('asks the visitor to open the Earth orbit view when nothing is loaded yet', () => {
    const onOpenOrbit = vi.fn()
    show(props({ field: null, onOpenOrbit }))
    fireEvent.click(screen.getByRole('button', { name: /Open the Earth orbit view/ }))
    expect(onOpenOrbit).toHaveBeenCalled()
  })

  it('holds the Space-Track lists back until the catalogue is loaded on request', async () => {
    fetchSatcatShard.mockImplementation((shard: number) =>
      Promise.resolve({
        generatedAt: 'x',
        citation: 'x',
        shard,
        rows:
          shard === 0
            ? [
                ['25544', '1998-067A', 'PAYLOAD', 'ISS', '1998-11-20', 'TTMTR', 'LARGE'],
                ['40001', '2010-022A', 'PAYLOAD', 'US', '2010-05-28', 'AFETR', 'MEDIUM'],
              ]
            : [],
      }),
    )
    show(props())
    fireEvent.change(screen.getByRole('combobox', { name: 'Browse by' }), {
      target: { value: 'radar' },
    })
    expect(rows()).toHaveLength(0)
    expect(fetchSatcatShard).not.toHaveBeenCalled()
    // The 16 shards' measured gzip size (#161).
    expect(screen.getByText(/a download of about 370 kB/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Load Space-Track/ }))
    await screen.findByRole('button', { name: /ISS \(ZARYA\)/ })
    expect(fetchSatcatShard).toHaveBeenCalledTimes(16)
    expect(rows()[0]).toMatch(/ISS/)
    expect(rows()[1]).toMatch(/GPS/)
  })

  it('says so when the Space-Track catalogue is not available', async () => {
    fetchSatcatShard.mockRejectedValue(new Error('503'))
    show(props())
    fireEvent.change(screen.getByRole('combobox', { name: 'Browse by' }), {
      target: { value: 'owner' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Load Space-Track/ }))
    expect(await screen.findByText(/isn.t available right now/)).toBeTruthy()
  })

  it('lists predicted re-entries, soonest first, marking those the orrery does not draw', () => {
    show(
      props({
        reentries: [
          {
            noradId: '99999',
            decayEpoch: '2026-11-09T00:00:00Z',
            windowMin: 600,
            msgEpoch: '2026-11-08T00:00:00Z',
            lat: null,
            lon: null,
            highInterest: false,
          },
          {
            noradId: '25544',
            decayEpoch: '2026-11-10T00:00:00Z',
            windowMin: 600,
            msgEpoch: '2026-11-08T00:00:00Z',
            lat: null,
            lon: null,
            highInterest: false,
          },
        ],
        reentryNames: { '99999': 'FALCON 9 R/B' },
      }),
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Browse by' }), {
      target: { value: 'reentry' },
    })
    const list = rows()
    expect(list).toHaveLength(2)
    expect(list[0]).toMatch(/FALCON 9 R\/B/)
    // Starlink and debris are off, so it may be in one of them: never "in no group".
    // A named object keeps its NORAD number in the detail line.
    expect(list[0]).toMatch(/NORAD 99999/)
    expect(list[0]).toMatch(/not in the groups switched on/i)
    // The intro claims only what is known without SATCAT.
    expect(screen.getByText(/Some may be in groups that are switched off/)).toBeTruthy()
    expect(screen.queryByText(/Some are rocket stages/)).toBeNull()
    expect(list[0]).toMatch(/may be in Starlink or Debris, which are off/)
    expect(list[0]).not.toMatch(/no group/i)
    expect(list[0]).not.toMatch(/Object 99999/)
    expect(list[1]).toMatch(/ISS/)
    expect(screen.queryByRole('button', { name: /FALCON 9/ })).toBeNull()
  })

  it('says "in no group" only once every group is switched on and loaded', () => {
    const loaded = { status: 'loaded', count: 1, degraded: false, ageSeconds: 0 } as const
    show(
      props({
        toggles: ALL_SAT_TOGGLES_ON,
        groups: Object.fromEntries(SAT_GROUPS.map((g) => [g.id, loaded])),
        reentries: [
          {
            noradId: '99999',
            decayEpoch: '2026-11-09T00:00:00Z',
            windowMin: 600,
            msgEpoch: '2026-11-08T00:00:00Z',
            lat: null,
            lon: null,
            highInterest: false,
          },
        ],
      }),
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Browse by' }), {
      target: { value: 'reentry' },
    })
    expect(rows()[0]).toMatch(/in no group the orrery carries/)
    // The title is the id (no name known): the detail line does not repeat it.
    expect(rows()[0]?.match(/NORAD 99999/g)).toHaveLength(1)
  })

  it('says when re-entry predictions are not available', () => {
    show(props({ reentriesAvailable: false }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Browse by' }), {
      target: { value: 'reentry' },
    })
    expect(screen.getByText(/aren.t available right now/)).toBeTruthy()
  })
})

describe('<SatControls> browse button (#158)', () => {
  it('opens the browser and closes it again', async () => {
    const client = new QueryClient()
    const browse = props()
    render(
      <QueryClientProvider client={client}>
        <SatControls
          toggles={DEFAULT_SAT_TOGGLES}
          onToggles={() => undefined}
          status="x"
          browse={browse}
        />
      </QueryClientProvider>,
    )
    expect(screen.queryByRole('combobox', { name: 'Browse by' })).toBeNull()
    const open = screen.getByRole('button', { name: 'Browse satellites' })
    expect(open.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(open)
    expect(await screen.findByRole('combobox', { name: 'Browse by' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close the satellite browser' }))
    expect(screen.queryByRole('combobox', { name: 'Browse by' })).toBeNull()
  })

  it('has no Browse button when the page gives it nothing to browse', () => {
    render(<SatControls toggles={DEFAULT_SAT_TOGGLES} onToggles={() => undefined} status="x" />)
    expect(screen.queryByRole('button', { name: 'Browse satellites' })).toBeNull()
  })
})
