import { describe, expect, it, vi } from 'vitest'

import { cappedPixelRatio, watchPixelRatio } from '@/components/orrery/three/pixelRatio'

/** A window whose devicePixelRatio can change and whose matchMedia fires once per query. */
function fakeWindow(start: number) {
  const win = { devicePixelRatio: start } as unknown as Window
  const queries: { query: string; fire: () => void; removed: boolean }[] = []
  ;(win as { matchMedia: unknown }).matchMedia = (query: string) => {
    let listener: (() => void) | null = null
    const entry = {
      query,
      removed: false,
      fire: () => {
        // A resolution query changes once: it fires, then stays false for good.
        const l = listener
        listener = null
        l?.()
      },
    }
    queries.push(entry)
    return {
      media: query,
      addEventListener: (_: string, l: () => void) => {
        listener = l
      },
      removeEventListener: () => {
        listener = null
        entry.removed = true
      },
    }
  }
  const live = () => queries.filter((q) => !q.removed)
  const change = (dpr: number) => {
    ;(win as { devicePixelRatio: number }).devicePixelRatio = dpr
    live().at(-1)?.fire()
  }
  return { win, queries, change }
}

describe('cappedPixelRatio (#200)', () => {
  it('follows devicePixelRatio and caps it at 2', () => {
    expect(cappedPixelRatio({ devicePixelRatio: 1 })).toBe(1)
    expect(cappedPixelRatio({ devicePixelRatio: 1.5 })).toBe(1.5)
    expect(cappedPixelRatio({ devicePixelRatio: 3 })).toBe(2)
  })

  it('falls back to 1 without a usable ratio', () => {
    expect(cappedPixelRatio({ devicePixelRatio: 0 })).toBe(1)
    expect(cappedPixelRatio({ devicePixelRatio: Number.NaN })).toBe(1)
  })

  it('sizes the drawing buffer as the CSS size times the capped ratio', () => {
    const css = { w: 1440, h: 900 }
    expect(Math.floor(css.w * cappedPixelRatio({ devicePixelRatio: 3 }))).toBe(2880)
    expect(Math.floor(css.h * cappedPixelRatio({ devicePixelRatio: 1 }))).toBe(900)
  })
})

describe('watchPixelRatio (#200)', () => {
  it('reports every change in a 1 to 2 to 3 to 1 run, re-arming the query each time', () => {
    const f = fakeWindow(1)
    const seen: number[] = []
    watchPixelRatio(f.win, (ratio) => seen.push(ratio))
    f.change(2)
    f.change(3)
    f.change(1)
    expect(seen).toEqual([2, 2, 1])
    expect(f.queries.map((q) => q.query)).toEqual([
      '(resolution: 1dppx)',
      '(resolution: 2dppx)',
      '(resolution: 3dppx)',
      '(resolution: 1dppx)',
    ])
  })

  it('stops listening once disposed', () => {
    const f = fakeWindow(1)
    const onChange = vi.fn()
    const stop = watchPixelRatio(f.win, onChange)
    f.change(2)
    stop()
    expect(f.queries.every((q) => q.removed)).toBe(true)
    f.change(3)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('does nothing without matchMedia', () => {
    const stop = watchPixelRatio({ devicePixelRatio: 1 } as unknown as Window, vi.fn())
    expect(() => {
      stop()
    }).not.toThrow()
  })
})
