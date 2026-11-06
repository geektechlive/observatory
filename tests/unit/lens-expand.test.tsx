/**
 * The larger view (#89): one button fills the screen with the lens; Esc or the button
 * returns, focus goes back to the button, and the page can't scroll underneath.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ExpandButton } from '@/components/lens/ExpandButton'
import { useLensExpand } from '@/hooks/useLensExpand'

function Harness() {
  const { expanded, toggle, buttonRef } = useLensExpand()
  return (
    <>
      <p data-testid="state">{expanded ? 'expanded' : 'normal'}</p>
      <ExpandButton ref={buttonRef} expanded={expanded} onToggle={toggle} />
      <button type="button">elsewhere</button>
    </>
  )
}

const state = () => screen.getByTestId('state').textContent

describe('useLensExpand + ExpandButton (#89)', () => {
  afterEach(cleanup)

  it('opens and closes from the button, which says which it will do', () => {
    render(<Harness />)
    const button = screen.getByRole('button', { name: 'Expand view' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(button)
    expect(state()).toBe('expanded')
    expect(screen.getByRole('button', { name: 'Exit full view' })).toBe(button)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(button)
    expect(state()).toBe('normal')
  })

  it('locks page scrolling while expanded and restores it after', () => {
    render(<Harness />)
    document.documentElement.style.overflow = 'auto'
    fireEvent.click(screen.getByRole('button', { name: 'Expand view' }))
    expect(document.documentElement.style.overflow).toBe('hidden')
    fireEvent.click(screen.getByRole('button', { name: 'Exit full view' }))
    expect(document.documentElement.style.overflow).toBe('auto')
  })

  it('Esc returns to the page and puts focus back on the button', () => {
    render(<Harness />)
    const button = screen.getByRole('button', { name: 'Expand view' })
    fireEvent.click(button)
    screen.getByRole('button', { name: 'elsewhere' }).focus()
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(state()).toBe('normal')
    expect(document.activeElement).toBe(button)
  })

  it('makes the rest of the document inert while expanded, and only that', () => {
    const skip = document.createElement('a')
    skip.href = '#main'
    document.body.prepend(skip)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand view' }))
    expect(skip.hasAttribute('inert')).toBe(true)
    expect(screen.getByRole('button', { name: 'Exit full view' }).closest('[inert]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Exit full view' }))
    expect(skip.hasAttribute('inert')).toBe(false)
    skip.remove()
  })

  it('ignores Esc when not expanded', () => {
    render(<Harness />)
    const other = screen.getByRole('button', { name: 'elsewhere' })
    other.focus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(state()).toBe('normal')
    expect(document.activeElement).toBe(other)
  })
})
