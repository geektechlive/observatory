import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ControlRail } from '@/components/orrery/ControlRail'
import { DEFAULT_CRAFT_FILTER } from '@/components/orrery/craftFilter'

afterEach(cleanup)

const noop = () => undefined

function renderRail() {
  return render(
    <ControlRail
      open
      visibility={{ planets: true, orbits: true, labels: true }}
      onVisibility={noop}
      scale="exaggerated"
      onScale={noop}
      preset={null}
      onPreset={noop}
      onSelect={noop}
      craftFilter={DEFAULT_CRAFT_FILTER}
      onCraftFilter={noop}
      dsnCount={2}
    />,
  )
}

// Chris couldn't tell what "Only in DSN contact (2)" meant (#122). Tooltips don't
// exist on a phone, so each spacecraft switch carries a visible, linked hint.
describe('spacecraft switches explain themselves (#122)', () => {
  it.each([
    [/deep space/i, /Voyager 1, Voyager 2 and New Horizons/],
    [/missions/i, /Parker, Juno, Europa Clipper/],
    [/L1 & L2/i, /JWST/],
    [/talking to Earth now/i, /Deep Space Network/],
  ])('%s has a description', (name, hint) => {
    renderRail()
    const toggle = screen.getByRole('switch', { name })
    const id = toggle.getAttribute('aria-describedby')
    expect(id).toBeTruthy()
    expect(document.getElementById(id ?? '')?.textContent).toMatch(hint)
  })

  it('spells out DSN instead of using the acronym in the label', () => {
    renderRail()
    expect(screen.getByRole('switch', { name: /talking to Earth now \(2\)/i })).toBeTruthy()
    expect(screen.queryByText(/Only in DSN contact/)).toBeNull()
  })
})

// The scale choice is a group of pressed buttons, like the View chips, not a radiogroup
// that ignores the arrow keys (#192).
describe('scale choice (#192)', () => {
  it('is a labelled group of aria-pressed buttons', () => {
    renderRail()
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    const group = screen.getByRole('group', { name: 'Scale' })
    const pressed = within(group)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
    expect(pressed).toHaveLength(1)
  })
})
