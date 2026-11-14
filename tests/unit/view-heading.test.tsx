/**
 * Each view names itself with a heading inside the main landmark (#251): the page's only
 * heading above the panels was "Observatory", so heading navigation never said which view
 * was on screen. Visually hidden: the dial and the header subtitle already show it.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ViewHeading } from '@/components/nav/ViewHeading'
import { CONSOLE_VIEWS } from '@/lib/viewMeta'

afterEach(cleanup)

describe('ViewHeading (#251)', () => {
  it.each(CONSOLE_VIEWS)('names the %s view in a level-2 heading, visually hidden', (view) => {
    render(<ViewHeading view={view} />)
    const h = screen.getByRole('heading', { level: 2 })
    expect(h.textContent.toLowerCase()).toContain(view)
    expect(h.className).toBe('visually-hidden')
  })
})
