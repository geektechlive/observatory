/**
 * A link to a comet or interstellar object (#99): `focus=sbc:<SPK-ID>`. Their data loads
 * only on demand, so the link asks for it, waits, then selects. Anything else (a close
 * approach's `sb:` key, a malformed id) never triggers that 72 kB fetch.
 */
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { OrreryRenderer } from '@/components/orrery/three/OrreryRenderer'
import { useOrreryLink } from '@/components/orrery/useOrreryLink'
import { useOrreryView } from '@/store/orreryView'

const RENDERER = {} as unknown as OrreryRenderer
const BASE_CATALOG = [{ key: 'Mars', label: 'Mars' }]
const COMET = { key: 'sbc:1004119', label: 'C/2026 A2 (Bok)', available: true }

interface Props {
  catalog: readonly { key: string; label: string; available?: boolean }[]
  smallSettled: boolean
}

function mount(hash: string, request: () => void, initial: Partial<Props> = {}) {
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
        clearSelection: () => {
          useOrreryView.getState().setSelected(null)
        },
        hasModel: () => false,
      })
    },
    { initialProps: { catalog: BASE_CATALOG, smallSettled: false, ...initial } },
  )
}

const selected = () => useOrreryView.getState().selected

beforeEach(() => {
  useOrreryView.setState({ selected: null, preset: null, detail: null })
})
afterEach(cleanup)

describe('a link to a comet or interstellar object (#99)', () => {
  it('asks for the data, waits for it, then selects the object', () => {
    const request = vi.fn()
    const view = mount('#orrery?focus=sbc:1004119', request)
    expect(request).toHaveBeenCalled()
    expect(selected()).toBeNull()
    view.rerender({ catalog: [...BASE_CATALOG, COMET], smallSettled: true })
    expect(selected()).toBe('sbc:1004119')
  })

  it('drops the focus once the data has answered without it', () => {
    const request = vi.fn()
    const view = mount('#orrery?focus=sbc:9999999', request)
    expect(selected()).toBeNull()
    view.rerender({ catalog: BASE_CATALOG, smallSettled: true })
    expect(selected()).toBeNull()
    expect(window.location.hash).toBe('#orrery')
  })

  it('never fetches for a close approach key or a malformed id', () => {
    for (const hash of ['#orrery?focus=sb:2026%20UE2', '#orrery?focus=sbc:2026%20UE2']) {
      const request = vi.fn()
      mount(hash, request)
      expect(request, hash).not.toHaveBeenCalled()
      cleanup()
    }
  })
})
