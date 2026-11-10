import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { OrreryRenderer } from '@/components/orrery/three/OrreryRenderer'
import { useOrreryLink } from '@/components/orrery/useOrreryLink'
import { useOrreryView } from '@/store/orreryView'

const CATALOG = [
  { key: 'Mars', label: 'Mars' },
  { key: 'naif:-31', label: 'Voyager 1' },
]
const RENDERER = {} as unknown as OrreryRenderer

interface Props {
  hasModel: (key: string) => boolean
  satFound: boolean
  satSettled: boolean
  satVersion: number
}

const base: Props = {
  hasModel: () => true,
  satFound: false,
  satSettled: false,
  satVersion: 0,
}

function mount(initial: Partial<Props> = {}) {
  return renderHook(
    (p: Props) => {
      const selected = useOrreryView((s) => s.selected)
      const preset = useOrreryView((s) => s.preset)
      return useOrreryLink({
        renderer: RENDERER,
        catalog: CATALOG,
        settled: true,
        selected,
        preset,
        select: useOrreryView.getState().setSelected,
        applyPreset: useOrreryView.getState().setPreset,
        requestLookup: vi.fn(),
        lookupFailed: false,
        sats: {
          has: () => p.satFound,
          settled: p.satSettled,
          allOn: true,
          version: p.satVersion,
          openOrbit: vi.fn(),
          widen: vi.fn(),
          restore: vi.fn(),
        },
        clearSelection: () => {
          useOrreryView.getState().setSelected(null)
        },
        hasModel: p.hasModel,
      })
    },
    { initialProps: { ...base, ...initial } },
  )
}

const detail = () => useOrreryView.getState().detail
const selected = () => useOrreryView.getState().selected

function go(hash: string) {
  act(() => {
    window.history.replaceState(null, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

beforeEach(() => {
  window.history.replaceState(null, '', '#orrery')
  useOrreryView.setState({ selected: null, preset: null, detail: null })
})
afterEach(cleanup)

describe('the detail link (#203)', () => {
  it('openDetail does nothing unless the key is the selection', () => {
    useOrreryView.setState({ selected: 'Mars', detail: null })
    act(() => {
      useOrreryView.getState().openDetail('naif:-31')
    })
    expect(detail()).toBeNull()
    expect(selected()).toBe('Mars')
    act(() => {
      useOrreryView.getState().openDetail('Mars')
    })
    expect(detail()).toBe('Mars')
  })

  it('a visitor opening the detail while a link waits keeps it open (A)', () => {
    useOrreryView.setState({ selected: 'sat:25544' })
    window.history.replaceState(null, '', '#orrery?focus=sat:25544')
    const hook = mount()
    // The object is already selected; the visitor opens its detail before the link resolves.
    act(() => {
      useOrreryView.getState().openDetail('sat:25544')
    })
    hook.rerender({ ...base, satFound: true, satSettled: true, satVersion: 1 })
    expect(detail()).toBe('sat:25544')
    expect(window.location.hash).toBe('#orrery?focus=sat:25544&detail=1')
  })

  it('a visitor closing the detail while a link waits keeps it closed (B)', () => {
    useOrreryView.setState({ selected: 'sat:25544', detail: 'sat:25544' })
    window.history.replaceState(null, '', '#orrery?focus=sat:25544&detail=1')
    const hook = mount()
    act(() => {
      useOrreryView.getState().closeDetail()
    })
    hook.rerender({ ...base, satFound: true, satSettled: true, satVersion: 1 })
    expect(detail()).toBeNull()
    expect(window.location.hash).toBe('#orrery?focus=sat:25544')
  })

  it('a cold load with detail and a focus that resolves at once opens the detail', () => {
    window.history.replaceState(null, '', '#orrery?focus=Mars&detail=1')
    mount()
    expect(selected()).toBe('Mars')
    expect(detail()).toBe('Mars')
    expect(window.location.hash).toBe('#orrery?focus=Mars&detail=1')
  })

  it('opens only after a late focus resolves (a satellite group still loading)', () => {
    window.history.replaceState(null, '', '#orrery?focus=sat:25544&detail=1')
    const hook = mount()
    expect(detail()).toBeNull()
    expect(selected()).toBeNull()
    hook.rerender({ ...base, satFound: true, satSettled: true, satVersion: 1 })
    expect(selected()).toBe('sat:25544')
    expect(detail()).toBe('sat:25544')
    expect(window.location.hash).toBe('#orrery?focus=sat:25544&detail=1')
  })

  it('a focus that never resolves drops the detail from the address, with no new entry', () => {
    const length = window.history.length
    window.history.replaceState(null, '', '#orrery?focus=sat:99999&detail=1')
    const hook = mount()
    hook.rerender({ ...base, satFound: false, satSettled: true, satVersion: 1 })
    expect(selected()).toBeNull()
    expect(detail()).toBeNull()
    expect(window.location.hash).not.toContain('detail')
    expect(window.history.length).toBe(length)
  })

  it('an object with no model keeps the focus, opens the inspector and drops detail', () => {
    window.history.replaceState(null, '', '#orrery?focus=Mars&detail=1')
    mount({ hasModel: () => false })
    expect(selected()).toBe('Mars')
    expect(detail()).toBeNull()
    expect(window.location.hash).toBe('#orrery?focus=Mars')
  })

  it('a detail with no focus is ignored and dropped', () => {
    window.history.replaceState(null, '', '#orrery?detail=1')
    mount()
    expect(selected()).toBeNull()
    expect(detail()).toBeNull()
    expect(window.location.hash).toBe('#orrery')
  })

  it('opening writes detail into the address and closing clears it', () => {
    window.history.replaceState(null, '', '#orrery?focus=Mars')
    mount()
    act(() => {
      useOrreryView.getState().openDetail('Mars')
    })
    expect(window.location.hash).toBe('#orrery?focus=Mars&detail=1')
    act(() => {
      useOrreryView.getState().closeDetail()
    })
    expect(detail()).toBeNull()
    expect(selected()).toBe('Mars')
    expect(window.location.hash).toBe('#orrery?focus=Mars')
  })

  it('choosing another object closes the detail', () => {
    window.history.replaceState(null, '', '#orrery?focus=Mars&detail=1')
    mount()
    act(() => {
      useOrreryView.getState().setSelected('naif:-31')
    })
    expect(detail()).toBeNull()
    expect(window.location.hash).toBe('#orrery?focus=naif:-31')
  })

  it('back and forward re-apply or close it', () => {
    window.history.replaceState(null, '', '#orrery?focus=Mars&detail=1')
    mount()
    go('#orrery?focus=Mars')
    expect(detail()).toBeNull()
    expect(selected()).toBe('Mars')
    go('#orrery?focus=Mars&detail=1')
    expect(detail()).toBe('Mars')
    go('#orrery?focus=naif:-31')
    expect(detail()).toBeNull()
    expect(selected()).toBe('naif:-31')
  })
})
