import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FoldGroup } from '@/components/orrery/FoldGroup'
import { foldOpen, resetFoldMemory } from '@/components/orrery/railFolds'
import { Switch } from '@/components/orrery/Switch'

beforeEach(() => {
  localStorage.clear()
  resetFoldMemory()
})
afterEach(cleanup)

const noop = () => undefined

function Group({ on }: { on: readonly string[] }) {
  return (
    <FoldGroup id="orbit" title="Earth orbit" readout={`${String(on.length)} of 2 on`} onKeys={on}>
      <Switch label="Space stations" on={on.includes('Space stations')} onChange={noop} />
      <Switch label="Starlink" on={on.includes('Starlink')} onChange={noop} />
    </FoldGroup>
  )
}

const toggle = () => screen.getByRole('button', { name: /Earth orbit/ })

// The rail folds its layer groups (#273, direction A): the heading is the button.
describe('FoldGroup (#273)', () => {
  it('is a level-2 heading wrapping a button that says what is on', () => {
    render(<Group on={['Space stations']} />)
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading.textContent).toContain('Earth orbit')
    expect(heading.querySelector('button')).toBe(toggle())
    expect(toggle().textContent).toContain('1 of 2 on')
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('switch', { name: 'Starlink' })).toBeNull()
  })

  it('opens and folds, and remembers the visitor’s choice', () => {
    render(<Group on={[]} />)
    fireEvent.click(toggle())
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('switch', { name: 'Starlink' })).toBeTruthy()
    expect(foldOpen('orbit')).toBe(true)
    fireEvent.click(toggle())
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(foldOpen('orbit')).toBe(false)
  })

  it('keeps its contents mounted while folded', () => {
    render(<Group on={[]} />)
    const body = document.getElementById(toggle().getAttribute('aria-controls') ?? '')
    expect(body?.hidden).toBe(true)
    expect(body?.querySelectorAll('[role="switch"]')).toHaveLength(2)
  })

  it('says nothing on first render, even with layers on', () => {
    render(<Group on={['Space stations', 'Starlink']} />)
    expect(screen.getByRole('status').textContent).toBe('')
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps its status region in place, so the note is spoken when it arrives', () => {
    const { rerender } = render(<Group on={[]} />)
    const region = screen.getByRole('status')
    act(() => {
      rerender(<Group on={['Starlink']} />)
    })
    expect(screen.getByRole('status')).toBe(region)
    expect(region.textContent).toBe('Starlink switched on')
  })

  it('marks every row it switched on, and clears the mark and note after 8 s', () => {
    vi.useFakeTimers()
    try {
      const { rerender } = render(<Group on={[]} />)
      act(() => {
        rerender(<Group on={['Space stations', 'Starlink']} />)
      })
      expect(document.querySelectorAll('[data-just-on]')).toHaveLength(2)
      expect(screen.getByRole('status').textContent).toBe('Space stations and Starlink switched on')
      act(() => {
        vi.advanceTimersByTime(8000)
      })
      expect(document.querySelectorAll('[data-just-on]')).toHaveLength(0)
      expect(screen.getByRole('status').textContent).toBe('')
      // Still open: only the cue goes.
      expect(toggle().getAttribute('aria-expanded')).toBe('true')
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops the cue when the visitor folds the group', () => {
    const { rerender } = render(<Group on={[]} />)
    act(() => {
      rerender(<Group on={['Starlink']} />)
    })
    fireEvent.click(toggle())
    expect(screen.getByRole('status').textContent).toBe('')
    // Folding by hand with nothing new switched on doesn't reopen it.
    act(() => {
      rerender(<Group on={['Starlink']} />)
    })
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('opens itself, marks the row and says why when a layer is switched on from outside', () => {
    const { rerender } = render(<Group on={[]} />)
    act(() => {
      rerender(<Group on={['Starlink']} />)
    })
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('status').textContent).toBe('Starlink switched on')
    const row = screen.getByRole('switch', { name: 'Starlink' }).closest('[data-just-on]')
    expect(row).not.toBeNull()
    // Opening by itself is not the visitor's choice: the next visit starts folded again.
    resetFoldMemory()
    expect(foldOpen('orbit')).toBe(false)
  })

  it('leaves an open group alone when a layer in it changes', () => {
    const { rerender } = render(<Group on={[]} />)
    fireEvent.click(toggle())
    act(() => {
      rerender(<Group on={['Starlink']} />)
    })
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('marks an Off readout as off', () => {
    render(
      <FoldGroup id="small" title="Small bodies" readout="Off" off onKeys={[]}>
        <p>x</p>
      </FoldGroup>,
    )
    expect(screen.getByText('Off').hasAttribute('data-off')).toBe(true)
  })
})
