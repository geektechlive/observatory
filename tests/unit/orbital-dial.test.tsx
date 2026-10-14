import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { OrbitalDial } from '@/components/nav/OrbitalDial'
import { useUiStore } from '@/store/ui'

afterEach(cleanup)
beforeEach(() => {
  useUiStore.getState().setView('earth')
})

describe('OrbitalDial', () => {
  it('is a tablist with the active tab selected', () => {
    render(<OrbitalDial />)
    expect(screen.getByRole('tab', { name: /EARTH/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: /SUN/ }).getAttribute('aria-selected')).toBe('false')
  })

  it('Home and End jump to the first and last console (#54)', () => {
    render(<OrbitalDial />)
    const earth = screen.getByRole('tab', { name: /EARTH/ })
    fireEvent.keyDown(earth, { key: 'End' })
    expect(useUiStore.getState().view).toBe('orbit')
    fireEvent.keyDown(screen.getByRole('tab', { name: /ORBIT/ }), { key: 'Home' })
    expect(useUiStore.getState().view).toBe('earth')
  })

  it('draws each glyph on the shared tick ring (the same primitive as the globe bezel)', () => {
    const { container } = render(<OrbitalDial />)
    expect(container.querySelectorAll('[data-tick="major"]').length).toBe(4 * 4)
  })
})
