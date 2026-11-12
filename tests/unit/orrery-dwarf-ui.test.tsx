/**
 * The dwarf planets on the orrery page (#99 item 8): the Find box, a link by name, the
 * "Dwarf planets" switch (off at first, data lazy), the inspector, the marker's px clamp
 * and their colour (neither spacecraft cyan nor hazard red).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { smallBodyCatalog } from '@/components/orrery/catalog'
import { DwarfControls } from '@/components/orrery/DwarfControls'
import { Inspector } from '@/components/orrery/Inspector'
import type { OrreryRenderer } from '@/components/orrery/three/OrreryRenderer'
import { DWARF_MIN_PX, PX_CEILING } from '@/components/orrery/three/pxClamp'
import { useOrreryLink } from '@/components/orrery/useOrreryLink'
import { parseOklch } from '@/lib/color'
import { dwarfEntries } from '@/lib/orrery/dwarfView'
import { DWARF_HEX, ISS_HEX, STATUS_HEX, TOKEN_OKLCH } from '@/lib/palette'
import type { OrreryDwarfs } from '@/schemas/orreryDwarfs'
import { useOrreryView } from '@/store/orreryView'

const DAY_MS = 86_400_000
const jdOf = (ms: number) => ms / DAY_MS + 2440587.5
/** 2000-01-01 to 2050, so 1000 AD is outside it. */
const span = () => {
  const samples: number[] = []
  for (let k = 0; k < 11; k += 1) samples.push(39 - k * 0.1, 10, 1)
  return { start: 2451544.5, step: 1826, samples }
}
const data = {
  dwarfs: [
    {
      id: 'sb:20134340',
      spkid: '20134340',
      name: 'Pluto',
      target: 'Pluto Barycenter (9)',
      availableFrom: null,
      availableTo: null,
      coarse: span(),
    },
  ],
} as unknown as OrreryDwarfs
const entries = dwarfEntries(data)
const pluto = entries[0]

afterEach(cleanup)

describe('the Find box', () => {
  it('lists each dwarf planet under its own group, available where its span covers the date', () => {
    expect(smallBodyCatalog(entries, jdOf(Date.UTC(2026, 0, 1)))).toEqual([
      {
        key: 'sbc:20134340',
        label: 'Pluto',
        kind: 'dwarf',
        group: 'Dwarf planets',
        available: true,
      },
    ])
    expect(smallBodyCatalog(entries, jdOf(Date.UTC(1000, 0, 1)))[0]?.available).toBe(false)
  })
})

describe('a link by name: focus=pluto (#99 item 8)', () => {
  const RENDERER = {} as unknown as OrreryRenderer
  const BASE: Props['catalog'] = [{ key: 'Mars', label: 'Mars' }]
  interface Props {
    catalog: readonly { key: string; label: string; available?: boolean }[]
    smallSettled: boolean
  }
  const mount = (hash: string, request: () => void) => {
    window.history.replaceState(null, '', hash)
    return renderHook(
      (p: Props) => {
        const selected = useOrreryView((s) => s.selected)
        const preset = useOrreryView((s) => s.preset)
        return useOrreryLink({
          renderer: RENDERER,
          catalog: p.catalog,
          settled: true,
          selected,
          preset,
          select: useOrreryView.getState().setSelected,
          applyPreset: useOrreryView.getState().setPreset,
          requestLookup: vi.fn(),
          lookupFailed: false,
          smallBodies: { request, settled: p.smallSettled },
          sats: {
            has: () => false,
            settled: true,
            allOn: true,
            version: 0,
            openOrbit: vi.fn(),
            widen: vi.fn(),
            restore: vi.fn(),
          },
          clearSelection: vi.fn(),
          hasModel: () => false,
        })
      },
      { initialProps: { catalog: BASE, smallSettled: false } },
    )
  }
  beforeEach(() => {
    useOrreryView.setState({ selected: null, preset: null, detail: null })
  })

  it('asks for the lazy data, waits, then selects Pluto', () => {
    const request = vi.fn()
    const view = mount('#orrery?focus=pluto', request)
    expect(request).toHaveBeenCalledWith('pluto')
    expect(useOrreryView.getState().selected).toBeNull()
    view.rerender({
      catalog: [...BASE, { key: 'sbc:20134340', label: 'Pluto', available: true }],
      smallSettled: true,
    })
    expect(useOrreryView.getState().selected).toBe('sbc:20134340')
  })

  it('never fetches for a name that is not a dwarf planet', () => {
    const request = vi.fn()
    mount('#orrery?focus=jupiter-trojans', request)
    expect(request).not.toHaveBeenCalled()
  })
})

describe('DwarfControls', () => {
  it('is one switch, off at first, with the status beneath it', () => {
    const onChange = vi.fn()
    render(
      <DwarfControls
        on={false}
        onChange={onChange}
        status="No dwarf-planet data yet: the next data refresh adds it."
      />,
    )
    const sw = screen.getByRole('switch', { name: /Dwarf planets/ })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
    expect(screen.getByRole('status').textContent).toMatch(/No dwarf-planet data yet/)
  })
})

describe('the inspector on a dwarf planet', () => {
  const show = (simMs: number) => {
    if (!pluto) throw new Error('no Pluto')
    render(<Inspector body={pluto.key} smallBody={pluto} simMs={simMs} onClose={vi.fn()} />)
  }

  it('says where it is, what places it and what draws its line', () => {
    show(Date.UTC(2026, 0, 1))
    expect(screen.getByRole('heading', { name: 'Pluto' })).toBeTruthy()
    expect(screen.getByText('Dwarf planet')).toBeTruthy()
    expect(screen.getByText(/Pluto Barycenter \(9\)/)).toBeTruthy()
    expect(screen.getByText(/Pluto–Charon barycentre/)).toBeTruthy()
    expect(screen.getByText(/SBDB osculating elements/)).toBeTruthy()
    expect(screen.queryByText(/No JPL samples/)).toBeNull()
  })

  it('says when the span does not cover the date, and never extrapolates', () => {
    show(Date.UTC(1000, 0, 1))
    expect(screen.getByRole('status').textContent).toMatch(
      /JPL's ephemeris covers about 2000 to 2050.*never extrapolated/,
    )
  })
})

describe('the marker and its colour', () => {
  it('sits between its floor and a ceiling under the Sun’s 10 px', () => {
    expect(DWARF_MIN_PX).toBeLessThan(PX_CEILING.dwarf)
    expect(PX_CEILING.dwarf).toBeLessThan(10)
  })

  it('is a token in tokens.css, mirrored in palette.ts, neither cyan nor hazard red', () => {
    const tokens = readFileSync(join(__dirname, '..', '..', 'src', 'styles', 'tokens.css'), 'utf8')
    expect(tokens).toContain(`--dwarf: ${TOKEN_OKLCH.dwarf};`)
    expect(DWARF_HEX).toMatch(/^#[0-9a-f]{6}$/)
    expect(DWARF_HEX).not.toBe(ISS_HEX)
    expect(DWARF_HEX).not.toBe(STATUS_HEX.hazard)
    const hue = parseOklch(TOKEN_OKLCH.dwarf)?.h ?? Number.NaN
    // Cyan sits near 200-220, hazard red near 27.
    expect(Math.abs(hue - 210)).toBeGreaterThan(40)
    expect(Math.min(Math.abs(hue - 27), 360 - Math.abs(hue - 27))).toBeGreaterThan(40)
    const css = readFileSync(join(__dirname, '..', '..', 'src', 'styles', 'palette.css'), 'utf8')
    expect(css).toContain(`--data-dwarf: ${DWARF_HEX};`)
  })
})
