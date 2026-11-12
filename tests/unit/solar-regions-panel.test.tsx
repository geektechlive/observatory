/**
 * The Sun view's Active Regions panel and disc markers (#210), fed SWPC's real answers of
 * 2026-11-12 run through the endpoint's own parsers. NOAA's data is public domain, on the
 * condition that it is credited and not passed off as official (weather.gov/disclaimer).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { magClassWords } from '@/lib/magClass'
import { parseProbabilities, parseRegions } from '@/lib/swpcRegions'

import PROBABILITIES from './functions/fixtures/swpc-solar-probabilities.json'
import REGIONS from './functions/fixtures/swpc-solar-regions.json'
import EARLY from './functions/fixtures/swpc-solar-regions-early.json'

const hooks = vi.hoisted(() => ({
  useSolarRegions: vi.fn<() => { data: unknown; isLoading: boolean; error: Error | null }>(),
}))
vi.mock('@/hooks/useSolarRegions', () => hooks)

const { SolarRegionsPanel } = await import('@/components/panels/SolarRegionsPanel')
const { SunRegionLayer, IMAGE_ZOOM } = await import('@/components/stage/SunRegionLayer')

const FULL = {
  probabilities: parseProbabilities(PROBABILITIES),
  regions: parseRegions(REGIONS),
  updatedAt: '2026-11-12T05:35:00Z',
}

// SWPC's file at 06:14 UTC the same morning: early rows for 12 Nov (#213).
const EARLY_DAY = { ...FULL, regions: parseRegions(EARLY) }

function answer(data: unknown, error: Error | null = null) {
  hooks.useSolarRegions.mockReturnValue({ data, isLoading: false, error })
}

beforeEach(() => {
  // The fixtures' own morning: positions valid 12 Nov 00:00, odds for 12 Nov.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-12T06:00:00Z'))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SolarRegionsPanel', () => {
  it("shows the day-1 odds of C, M and X flares and protons, and the day they're for", () => {
    answer(FULL)
    render(<SolarRegionsPanel />)
    const odds = screen.getByRole('list', { name: /flare odds for 12 nov/i })
    expect(within(odds).getByText('90%')).toBeTruthy()
    expect(within(odds).getByText('45%')).toBeTruthy()
    expect(within(odds).getAllByText('5%')).toHaveLength(2)
    expect(within(odds).getByText('Proton')).toBeTruthy()
  })

  it("lists the numbered regions with location, area and SWPC's magnetic class in words", () => {
    answer(FULL)
    render(<SolarRegionsPanel />)
    const table = screen.getByRole('table', { name: /active regions/i })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(8)
    const big = rows.find((r) => r.textContent.includes('4566'))
    expect(big?.textContent).toContain('S07W48')
    expect(big?.textContent).toContain('280')
    expect(big?.textContent).toContain('Beta-Gamma')
  })

  it('credits NOAA SWPC, linked, and does not call the data official', () => {
    answer(FULL)
    const { container } = render(<SolarRegionsPanel />)
    const credit = screen.getByRole('link', { name: /noaa swpc/i })
    expect(credit.getAttribute('href')).toMatch(/^https:\/\/www\.spaceweather\.gov\//)
    expect(container.textContent.toLowerCase()).not.toContain('official')
  })

  it('says so on a day with no sunspot regions, and still shows the odds', () => {
    answer({ ...FULL, regions: { ...FULL.regions, items: [] } })
    render(<SolarRegionsPanel />)
    expect(screen.getByText(/no numbered sunspot regions/i)).toBeTruthy()
    expect(screen.getByRole('list', { name: /flare odds/i })).toBeTruthy()
  })

  it('shows the half it has when the other half failed', () => {
    answer({ ...FULL, regions: null })
    render(<SolarRegionsPanel />)
    expect(screen.getByRole('list', { name: /flare odds/i })).toBeTruthy()
    expect(screen.getByText(/region list did not load/i)).toBeTruthy()
  })

  it('dates old data when SWPC has not issued newer, and never says "today" over it', () => {
    vi.setSystemTime(new Date('2026-11-15T06:00:00Z'))
    answer({ ...FULL, regions: { ...FULL.regions, items: [] } })
    const { container } = render(<SolarRegionsPanel />)
    expect(screen.getByText(/as of 12 nov/i)).toBeTruthy()
    expect(screen.getByText(/latest issued/i)).toBeTruthy()
    expect(container.textContent.toLowerCase()).not.toContain('today')
  })

  it('adds no date warning to the current day', () => {
    answer(FULL)
    render(<SolarRegionsPanel />)
    expect(screen.queryByText(/as of/i)).toBeNull()
    expect(screen.queryByText(/latest issued/i)).toBeNull()
  })

  it('lists early-day regions with spots, the class and odds shown as not yet issued (#213)', () => {
    answer(EARLY_DAY)
    render(<SolarRegionsPanel />)
    const table = screen.getByRole('table', { name: /active regions/i })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(8)
    const big = rows.find((r) => r.textContent.includes('4566'))
    expect(big?.textContent).toContain('S08W61')
    expect(big?.textContent).not.toContain('0%')
    const unissued = within(big as HTMLElement).getAllByTitle(/not yet issued by swpc/i)
    expect(unissued).toHaveLength(2)
    expect(unissued.every((c) => c.textContent === '–')).toBe(true)
    expect(screen.getByText(/early reports/i)).toBeTruthy()
  })

  it('says nothing about early reports on a complete day', () => {
    answer(FULL)
    render(<SolarRegionsPanel />)
    expect(screen.queryByText(/early reports/i)).toBeNull()
    expect(screen.queryAllByTitle(/not yet issued/i)).toHaveLength(0)
  })

  it('says the feed did not answer when the request failed', () => {
    answer(undefined, new Error('503'))
    render(<SolarRegionsPanel />)
    expect(screen.getByText(/did not answer/i)).toBeTruthy()
  })
})

describe('magClassWords', () => {
  it('spells the codes as the region summary does, and keeps an unknown code as sent', () => {
    expect(magClassWords('BGD')).toBe('Beta-Gamma-Delta')
    expect(magClassWords('A')).toBe('Alpha')
    expect(magClassWords('BX')).toBe('BX')
    expect(magClassWords(null)).toBe('—')
  })
})

describe('SunRegionLayer', () => {
  const IMAGE_AT = '2026-11-12T05:00:00Z'

  it('marks every region still on the disc at the image time, numbered', () => {
    answer(FULL)
    const { container } = render(<SunRegionLayer wavelength="HMIB" observed={IMAGE_AT} />)
    const labels = [...container.querySelectorAll('[data-region]')].map((m) =>
      m.getAttribute('data-region'),
    )
    // 4565 (N14W85 at 2400Z) is about W88 by 05:00: on the near side, but HMI's frame is
    // zoomed past the stage's round crop there, so its spot isn't in the picture. No mark.
    expect(labels).toEqual(['4566', '4568', '4569', '4572', '4573', '4574', '4575'])
  })

  it('marks 4565 on AIA, whose smaller disc keeps the west limb inside the crop', () => {
    answer(FULL)
    const { container } = render(<SunRegionLayer wavelength="0171" observed={IMAGE_AT} />)
    expect(container.querySelector('[data-region="4565"]')).not.toBeNull()
  })

  it('sets the labels of close neighbours on opposite sides, so they do not overlap', () => {
    answer(FULL)
    const { container } = render(<SunRegionLayer wavelength="0171" observed={IMAGE_AT} />)
    const side = (n: string) =>
      container.querySelector(`[data-region="${n}"]`)?.getAttribute('data-label')
    expect(side('4572')).not.toBe(side('4573'))
    expect(side('4566')).not.toBe(side('4569'))
  })

  it('says why there are no marks when the positions are over two days old', () => {
    answer(FULL)
    const { container } = render(
      <SunRegionLayer wavelength="0171" observed="2026-11-14T06:00:00Z" />,
    )
    expect(container.querySelectorAll('[data-region]')).toHaveLength(0)
    expect(screen.getByText(/over two days old/i)).toBeTruthy()
  })

  it('puts 4566 right of and below the centre, where SDO shows it', () => {
    answer(FULL)
    const { container } = render(<SunRegionLayer wavelength="HMIB" observed={IMAGE_AT} />)
    const m = container.querySelector<HTMLElement>('[data-region="4566"]')
    const left = parseFloat(m?.style.left ?? '0')
    const top = parseFloat(m?.style.top ?? '0')
    // (882, 587) of 1024, seen through the stage's 1.12 zoom: 50 + (882/1024 - 0.5) * 112.
    expect(left).toBeCloseTo(50 + (882 / 1024 - 0.5) * 100 * IMAGE_ZOOM, 0)
    expect(top).toBeCloseTo(50 + (587 / 1024 - 0.5) * 100 * IMAGE_ZOOM, 0)
  })

  it('draws nothing until the image time is known: it cannot turn the positions', () => {
    answer(FULL)
    const { container } = render(<SunRegionLayer wavelength="0171" observed={null} />)
    expect(container.querySelectorAll('[data-region]')).toHaveLength(0)
  })

  it('keeps IMAGE_ZOOM in step with the zoom the stage applies to the image', () => {
    const css = readFileSync(
      join(__dirname, '..', '..', 'src', 'components', 'stage', 'sun-stage.module.css'),
      'utf8',
    )
    expect(css).toContain(`transform: scale(${String(IMAGE_ZOOM)})`)
  })
})

describe('the Regions switch on the stage', () => {
  it('hides and shows the markers', async () => {
    answer(FULL)
    const { SunStage } = await import('@/components/stage/SunStage')
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SunStage />
      </QueryClientProvider>,
    )
    const toggle = screen.getByRole('button', { name: /regions/i })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })
})
