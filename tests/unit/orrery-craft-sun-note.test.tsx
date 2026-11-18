/** A craft whose path dives inside the drawn Sun says the Sun is drawn larger (#261). */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { CraftFacts } from '@/components/orrery/CraftFacts'
import type { OrreryTrack } from '@/schemas/orreryBodies'
import { useOrreryView } from '@/store/orreryView'

afterEach(() => {
  cleanup()
  useOrreryView.getState().closeDetail()
  useOrreryView.getState().setSelected(null)
  useOrreryView.getState().setScale('exaggerated')
})

const T0 = Date.parse('2026-11-06T00:00:00Z')
const JD0 = 2461000.5

/** Two samples a day apart, both `r` au from the Sun and under a degree apart. */
function craft(r: number): OrreryTrack {
  return {
    id: 'naif:-96',
    naifId: '-96',
    name: 'Parker Solar Probe',
    mission: 'Touching the Sun (NASA)',
    category: 'spacecraft',
    group: 'mission',
    target: 'Parker Solar Probe (spacecraft) (-96)',
    observedUntil: null,
    availableFrom: null,
    availableTo: null,
    fine: null,
    coarse: { start: JD0, step: 1, samples: [r, 0, 0, r, r * 0.01, 0] },
  }
}

const note = () => screen.queryByText(/drawn larger than life/)

describe('CraftFacts: the drawn Sun note', () => {
  it('shows for a craft that passes inside the Sun as drawn, with its real closest pass', () => {
    render(<CraftFacts track={craft(0.046)} earth={null} jd={JD0} simMs={T0} link={undefined} />)
    expect(note()?.textContent).toContain('about 9.9 times the Sun’s radius')
  })

  it('does not show while the fly-in is open, where the Sun is its true size', () => {
    useOrreryView.getState().setSelected('naif:-96')
    useOrreryView.getState().openDetail('naif:-96')
    render(<CraftFacts track={craft(0.046)} earth={null} jd={JD0} simMs={T0} link={undefined} />)
    expect(note()).toBeNull()
  })

  it('shows in Log distance too', () => {
    useOrreryView.getState().setScale('log')
    render(<CraftFacts track={craft(0.046)} earth={null} jd={JD0} simMs={T0} link={undefined} />)
    expect(note()).not.toBeNull()
  })

  it('does not show in Proportional, where the Sun is its true size', () => {
    useOrreryView.getState().setScale('proportional')
    render(<CraftFacts track={craft(0.046)} earth={null} jd={JD0} simMs={T0} link={undefined} />)
    expect(note()).toBeNull()
  })

  it('does not show for a craft that stays outside the drawn Sun (Solar Orbiter, 0.28 au)', () => {
    render(<CraftFacts track={craft(0.28)} earth={null} jd={JD0} simMs={T0} link={undefined} />)
    expect(note()).toBeNull()
  })
})
