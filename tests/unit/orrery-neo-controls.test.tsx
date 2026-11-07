/**
 * The orrery's near-Earth controls (#92): the close-approach filters (spec Part 12) and
 * the Space weather switch, each explained in plain words (#122's rule: phones have no
 * hover), JPL Scout's unconfirmed objects listed with their uncertainty, and the
 * Earth–Moon/L1 preset.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ControlRail } from '@/components/orrery/ControlRail'
import { DEFAULT_CRAFT_FILTER } from '@/components/orrery/craftFilter'
import { NeoControls } from '@/components/orrery/NeoControls'
import { DEFAULT_NEO_FILTER } from '@/lib/orrery/asteroids'
import type { ScoutObject } from '@/schemas/orreryNeo'

afterEach(cleanup)

const noop = () => undefined

const SCOUT: ScoutObject = {
  objectName: '6L54C21',
  neoScore: 100,
  phaScore: 0,
  neo1kmScore: 0,
  ieoScore: 0,
  geocentricScore: 0,
  tisserandScore: 0,
  rating: 0,
  unc: 0.02,
  uncP1: 0.16,
  caDistLd: 15,
  moidAu: 0.02,
  vInfKms: 12.1,
  h: 24.1,
  vMag: 19.8,
  nObs: 20,
  arcHours: 25.45,
  rmsN: 0.26,
  lastRun: '2026-11-07T11:32:00.000Z',
}

function renderNeo(onFilter = vi.fn(), onSunLine = vi.fn(), onSelect = vi.fn()) {
  render(
    <NeoControls
      filter={DEFAULT_NEO_FILTER}
      onFilter={onFilter}
      shown={7}
      total={25}
      status="25 close approaches from JPL, sampled 3 h ago."
      scout={[SCOUT]}
      sunLine
      onSunLine={onSunLine}
      onSelect={onSelect}
    />,
  )
  return { onFilter, onSunLine, onSelect }
}

const hintOf = (el: HTMLElement) =>
  document.getElementById(el.getAttribute('aria-describedby') ?? '')?.textContent ?? ''

describe('NeoControls (#92)', () => {
  it('windows the approaches around the date shown, and says the data covers ±30 days (#136)', () => {
    const { onFilter } = renderNeo()
    const group = screen.getByRole('radiogroup', { name: /closest approach/i })
    const radios = within(group).getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual([
      'Within a day',
      'Within a week',
      'Within 30 days',
    ])
    expect(
      within(group)
        .getByRole('radio', { name: /within 30 days/i })
        .getAttribute('aria-checked'),
    ).toBe('true')
    fireEvent.click(within(group).getByRole('radio', { name: /within a day/i }))
    expect(onFilter).toHaveBeenCalledWith({ ...DEFAULT_NEO_FILTER, window: 'day' })
    expect(screen.getByText(/±30 days/)).toBeTruthy()
  })

  it('explains hazardous and risk-listed in plain words', () => {
    const { onFilter } = renderNeo()
    const pha = screen.getByRole('switch', { name: /hazardous only/i })
    expect(hintOf(pha)).toMatch(/140 m/)
    expect(hintOf(pha)).toMatch(/not a prediction/i)
    const risk = screen.getByRole('switch', { name: /risk list only/i })
    expect(hintOf(risk)).toMatch(/ESA/)
    fireEvent.click(risk)
    expect(onFilter).toHaveBeenCalledWith({ ...DEFAULT_NEO_FILTER, riskListedOnly: true })
  })

  it('counts what is drawn', () => {
    renderNeo()
    expect(screen.getByText(/7 of 25 drawn/)).toBeTruthy()
  })

  it("lists Scout's unconfirmed objects with their scores and uncertainty, no position", () => {
    const { onSelect } = renderNeo()
    const item = screen.getByRole('button', { name: /6L54C21/ })
    expect(item.textContent).toMatch(/100%/)
    expect(item.textContent).toMatch(/0\.02′/)
    fireEvent.click(item)
    expect(onSelect).toHaveBeenCalledWith('scout:6L54C21')
    expect(screen.getByText(/no position/i)).toBeTruthy()
  })

  it('has a Space weather switch for the Sun–Earth line and L1, explained', () => {
    const { onSunLine } = renderNeo()
    const sw = screen.getByRole('switch', { name: /Sun–Earth line/i })
    expect(hintOf(sw)).toMatch(/L1/)
    expect(hintOf(sw)).toMatch(/solar wind/i)
    fireEvent.click(sw)
    expect(onSunLine).toHaveBeenCalledWith(false)
  })
})

describe('the Earth–Moon/L1 preset (#92)', () => {
  it('is a working preset now', () => {
    const onPreset = vi.fn()
    render(
      <ControlRail
        open
        visibility={{ planets: true, orbits: true, labels: true }}
        onVisibility={noop}
        scale="exaggerated"
        onScale={noop}
        preset={null}
        onPreset={onPreset}
        onSelect={noop}
        craftFilter={DEFAULT_CRAFT_FILTER}
        onCraftFilter={noop}
      />,
    )
    const button = screen.getByRole('button', { name: 'Earth–Moon' })
    expect((button as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(button)
    expect(onPreset).toHaveBeenCalledWith('earth')
  })
})
