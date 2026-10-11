/**
 * GlobeA11yOverlay (#48): real focusable list items over the WebGL canvas, positioned
 * from the renderer's onFrame projection without React state per frame.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GlobeA11yOverlay } from '@/components/globe/GlobeA11yOverlay'
import type { ProjectedItem } from '@/components/globe/three/GlobeRenderer'

afterEach(cleanup)

function fakeRenderer() {
  let cb: ((items: readonly ProjectedItem[]) => void) | null = null
  return {
    setOnFrame: vi.fn((next: typeof cb) => {
      cb = next
    }),
    emit: (items: ProjectedItem[]) => {
      act(() => cb?.(items))
    },
  }
}

const EVENTS = [
  { lat: 35.4, lon: -118.6, kind: 'wildfires' },
  { lat: 17.2, lon: 134.8, kind: 'severeStorms' },
]
const QUAKES = [{ lat: 38.1, lon: 142.9, mag: 6.1, place: 'off Honshu, Japan' }]

describe('GlobeA11yOverlay', () => {
  it('renders a labelled list of focusable events and quakes', () => {
    const r = fakeRenderer()
    render(
      <GlobeA11yOverlay renderer={r} events={EVENTS} quakes={QUAKES} onFocusChange={vi.fn()} />,
    )
    expect(screen.getByRole('list', { name: /Earth events and earthquakes/ })).toBeTruthy()
    const items = screen.getAllByRole('listitem')
    expect(items.map((i) => i.getAttribute('aria-label'))).toEqual([
      'Wildfire at 35.4°, -118.6°',
      'Severe Storm at 17.2°, 134.8°',
      'Earthquake M6.1, off Honshu, Japan',
    ])
    for (const i of items) expect(i.getAttribute('tabindex')).toBe('0')
  })

  it('positions items from each frame and hides those behind the limb (out of the tab order)', () => {
    const r = fakeRenderer()
    render(
      <GlobeA11yOverlay renderer={r} events={EVENTS} quakes={QUAKES} onFocusChange={vi.fn()} />,
    )
    r.emit([
      { layer: 'events', index: 0, x: 100, y: 120, visible: true },
      { layer: 'events', index: 1, x: 300, y: 200, visible: false },
      { layer: 'quakes', index: 0, x: 210, y: 90, visible: true },
    ])
    const [front, back, quake] = screen.getAllByRole('listitem', { hidden: true })
    expect(front?.style.transform).toBe('translate(100px, 120px)')
    expect(front?.hidden).toBe(false)
    expect(back?.hidden).toBe(true)
    expect(quake?.style.transform).toBe('translate(210px, 90px)')
  })

  it('reports focus so the host can pause rotation, and shows the label as a tooltip', () => {
    const r = fakeRenderer()
    const onFocusChange = vi.fn()
    render(
      <GlobeA11yOverlay
        renderer={r}
        events={EVENTS}
        quakes={QUAKES}
        onFocusChange={onFocusChange}
      />,
    )
    r.emit([{ layer: 'events', index: 0, x: 100, y: 120, visible: true }])
    const [first] = screen.getAllByRole('listitem')
    if (!first) throw new Error('no items')
    fireEvent.focus(first)
    expect(onFocusChange).toHaveBeenLastCalledWith(true)
    expect(screen.getByRole('tooltip').textContent).toContain('Wildfire')
    fireEvent.blur(first)
    expect(onFocusChange).toHaveBeenLastCalledWith(false)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('keeps a focused item reachable even if a frame reports it behind the limb', () => {
    const r = fakeRenderer()
    render(
      <GlobeA11yOverlay renderer={r} events={EVENTS} quakes={QUAKES} onFocusChange={vi.fn()} />,
    )
    const [first] = screen.getAllByRole('listitem')
    if (!first) throw new Error('no items')
    fireEvent.focus(first)
    r.emit([{ layer: 'events', index: 0, x: 100, y: 120, visible: false }])
    expect(first.hidden).toBe(false)
  })

  it('unsubscribes from the renderer on unmount', () => {
    const r = fakeRenderer()
    const { unmount } = render(
      <GlobeA11yOverlay renderer={r} events={EVENTS} quakes={QUAKES} onFocusChange={vi.fn()} />,
    )
    unmount()
    expect(r.setOnFrame).toHaveBeenLastCalledWith(null)
  })
})
