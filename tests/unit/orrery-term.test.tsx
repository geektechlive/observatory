import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Term } from '@/components/orrery/Term'
import { glossaryEntry } from '@/lib/orrery/glossary'

afterEach(cleanup)

describe('Term: a definition beside the word it explains (#159)', () => {
  it('shows only the word until it is pressed', () => {
    render(
      <dl>
        <dt>
          <Term id="light-time">Light time</Term>
        </dt>
      </dl>,
    )
    const button = screen.getByRole('button', { name: /light time/i })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('opens the glossary definition when pressed, and closes it when pressed again', async () => {
    render(<Term id="range-rate">Seen from Earth</Term>)
    const button = screen.getByRole('button', { name: /seen from earth/i })
    fireEvent.click(button)
    const note = await screen.findByRole('note')
    expect(note.textContent).toContain(glossaryEntry('range-rate').short)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.getAttribute('aria-describedby')).toBe(note.id)
    fireEvent.click(button)
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('closes on Escape without leaving the page', async () => {
    render(<Term id="pha">Potentially hazardous?</Term>)
    fireEvent.click(screen.getByRole('button'))
    await screen.findByRole('note')
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Escape' })
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('names the term it defines in the definition', async () => {
    render(<Term id="epoch">Orbit data</Term>)
    fireEvent.click(screen.getByRole('button'))
    const note = await screen.findByRole('note')
    expect(note.textContent).toContain(glossaryEntry('epoch').term)
  })
})
