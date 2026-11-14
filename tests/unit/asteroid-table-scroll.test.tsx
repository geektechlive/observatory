/**
 * The Close Approaches table scrolls sideways inside its panel below 900 px (#226). The
 * scroll wrapper is a labelled, focusable region (#227), and it says when more is hidden
 * to the right (`data-more`), which the stylesheet turns into an edge fade.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AsteroidTable } from '@/components/panels/AsteroidTable'

vi.mock('@/hooks/useNeo', () => ({
  useNeo: () => ({ data: undefined, isLoading: true, error: null, dataUpdatedAt: 0 }),
}))

/** The callbacks the hook handed to `new ResizeObserver(...)`. */
let resizeCallbacks: (() => void)[] = []

beforeEach(() => {
  resizeCallbacks = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        resizeCallbacks.push(cb)
      }
      observe() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function setMetrics(
  el: HTMLElement,
  m: { scrollWidth: number; clientWidth: number; scrollLeft: number },
) {
  for (const [key, value] of Object.entries(m)) {
    Object.defineProperty(el, key, { configurable: true, value })
  }
}

function region() {
  return screen.getByRole('region', { name: 'Close approaches table' })
}

describe('AsteroidTable scroll wrapper', () => {
  it('is a focusable, labelled region', () => {
    render(<AsteroidTable />)
    expect(region().getAttribute('tabindex')).toBe('0')
  })

  it('flags more to the right while content overflows, and clears it at the end', () => {
    render(<AsteroidTable />)
    const el = region()
    expect(el.getAttribute('data-more')).toBe('false')

    setMetrics(el, { scrollWidth: 530, clientWidth: 358, scrollLeft: 0 })
    fireEvent.scroll(el)
    expect(el.getAttribute('data-more')).toBe('true')

    setMetrics(el, { scrollWidth: 530, clientWidth: 358, scrollLeft: 172 })
    fireEvent.scroll(el)
    expect(el.getAttribute('data-more')).toBe('false')
  })

  it('clears the flag when the table comes to fit', () => {
    render(<AsteroidTable />)
    const el = region()
    setMetrics(el, { scrollWidth: 530, clientWidth: 358, scrollLeft: 0 })
    fireEvent.scroll(el)
    expect(el.getAttribute('data-more')).toBe('true')

    setMetrics(el, { scrollWidth: 358, clientWidth: 358, scrollLeft: 0 })
    fireEvent.scroll(el)
    expect(el.getAttribute('data-more')).toBe('false')
  })

  it('measures again when the element is resized', () => {
    render(<AsteroidTable />)
    const el = region()
    expect(resizeCallbacks.length).toBeGreaterThan(0)

    setMetrics(el, { scrollWidth: 530, clientWidth: 358, scrollLeft: 0 })
    act(() => {
      for (const cb of resizeCallbacks) cb()
    })
    expect(el.getAttribute('data-more')).toBe('true')

    setMetrics(el, { scrollWidth: 530, clientWidth: 600, scrollLeft: 0 })
    act(() => {
      for (const cb of resizeCallbacks) cb()
    })
    expect(el.getAttribute('data-more')).toBe('false')
  })

  it('treats a 1 px gap as the end and a 2 px gap as more to scroll', () => {
    render(<AsteroidTable />)
    const el = region()
    setMetrics(el, { scrollWidth: 359, clientWidth: 358, scrollLeft: 0 })
    fireEvent.scroll(el)
    expect(el.getAttribute('data-more')).toBe('false')

    setMetrics(el, { scrollWidth: 360, clientWidth: 358, scrollLeft: 0 })
    fireEvent.scroll(el)
    expect(el.getAttribute('data-more')).toBe('true')
  })
})
