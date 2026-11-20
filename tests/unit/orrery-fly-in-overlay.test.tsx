/**
 * The fly-in's controls over the orrery's stage (#268): Back and Escape go back, the keys and
 * buttons turn and zoom, the bracket follows the craft with its range, and the credits name
 * the sources (and the moons left out).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FlyInOverlay, type FlyInOverlayHandle } from '@/components/orrery/FlyInOverlay'
import type { FileDescriptor } from '@/lib/orrery/modelDescriptor'

afterEach(cleanup)

const file: FileDescriptor = {
  kind: 'file',
  file: '/models/craft/parker.glb',
  credit: 'NASA/Matthew J. Garcia',
  licence: 'NASA media usage guidelines',
  sourceUrl: 'https://example.test/parker',
  attitude: 'sun',
  axis: [0, 0, 1],
  attitudeNote: 'Heat shield toward the Sun',
  scope: 'own',
}

function setup(omitted: readonly string[] = []) {
  const onBack = vi.fn()
  const onNudge = vi.fn()
  const ref = createRef<FlyInOverlayHandle>()
  render(
    <FlyInOverlay
      ref={ref}
      descriptor={file}
      title="Parker Solar Probe"
      omitted={omitted}
      onBack={onBack}
      onNudge={onNudge}
    />,
  )
  return { onBack, onNudge, ref }
}

describe('FlyInOverlay (#268)', () => {
  it('puts focus on Back, which goes back', () => {
    const { onBack } = setup()
    const back = screen.getByRole('button', { name: 'Back to orrery' })
    expect(document.activeElement).toBe(back)
    fireEvent.click(back)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('goes back on Escape, and leaves Escape alone once something used it', () => {
    const { onBack } = setup()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onBack).toHaveBeenCalledTimes(1)
    const used = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    used.preventDefault()
    window.dispatchEvent(used)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('turns with the arrow keys and zooms with plus, minus and the buttons', () => {
    const { onNudge } = setup()
    const group = screen.getByRole('group', { name: /Fly-in to Parker Solar Probe/ })
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    expect(onNudge).toHaveBeenLastCalledWith(-0.12, 0, 1)
    fireEvent.keyDown(group, { key: '+' })
    expect(onNudge).toHaveBeenLastCalledWith(0, 0, 0.8)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(onNudge).toHaveBeenLastCalledWith(0, 0, 1 / 0.8)
  })

  it('puts the bracket on the craft with its range while it is small, then fades it', () => {
    const { ref } = setup()
    const bracket = document.querySelector<HTMLElement>('[data-fly-target]')
    act(() => {
      ref.current?.update({
        key: 'naif:-96',
        phase: 'enter',
        trueness: 1,
        decor: 0,
        target: { x: 320, y: 240, radiusPx: 0.2, rangeKm: 4_200_000 },
      })
    })
    expect(Number(bracket?.style.opacity)).toBe(1)
    expect(bracket?.style.getPropertyValue('--target-x')).toBe('320.0px')
    expect(bracket?.textContent).toBe('4.20 million km')
    act(() => {
      ref.current?.update({
        key: 'naif:-96',
        phase: 'arrived',
        trueness: 1,
        decor: 0,
        target: { x: 320, y: 240, radiusPx: 300, rangeKm: 0.4 },
      })
    })
    expect(Number(bracket?.style.opacity)).toBe(0)
    expect(screen.getByRole('status').textContent).toBe('Beside Parker Solar Probe')
  })

  it('credits the sources and the model, and names moons left out', () => {
    setup(['Io'])
    const credit = document.querySelector('[data-fly-credit]')
    expect(credit?.textContent).toMatch(/JPL Horizons/)
    expect(credit?.textContent).toMatch(/ESA DISCOS/)
    expect(credit?.textContent).toMatch(/No data for Io on this date, so it is left out\./)
    expect(credit?.textContent).toMatch(/Model: NASA\/Matthew J\. Garcia/)
  })

  it('folds the credits behind one link, closed at first, so the stage stays clear', () => {
    setup([])
    const credit = document.querySelector('[data-fly-credit]')
    expect(credit?.tagName).toBe('DETAILS')
    expect((credit as HTMLDetailsElement).open).toBe(false)
    expect(credit?.querySelector('summary')?.textContent).toBe('Sources, credits and licence')
  })
})
