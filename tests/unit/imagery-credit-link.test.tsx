/**
 * Björn Jónsson's maps (#180): used as downscaled textures inside the orrery, credited by name
 * as his terms ask ("please mention their origin"), and linked to his own maps page, which
 * he welcomes ("You are also welcome to link to the maps from your own website").
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ImageryFacts } from '@/components/orrery/ImageryFacts'
import { BODY_IMAGERY } from '@/lib/orrery/imagery'

const JONSSON_MAPS = 'https://bjj.mmedia.is/data/planetary_maps.html'

afterEach(cleanup)

describe('Jónsson credit (#180)', () => {
  it('links every body credited to Jónsson to his maps page', () => {
    const credited = Object.entries(BODY_IMAGERY).filter(([, img]) =>
      img.credit.includes('Jónsson'),
    )
    expect(credited.map(([name]) => name).sort()).toEqual(['Neptune', 'Saturn'])
    for (const [, img] of credited) expect(img.creditUrl).toBe(JONSSON_MAPS)
  })

  it('shows the credit as a link in the inspector', () => {
    render(<ImageryFacts body="Saturn" />)
    const link = screen.getByRole('link', { name: BODY_IMAGERY.Saturn.credit })
    expect(link.getAttribute('href')).toBe(JONSSON_MAPS)
  })

  it('keeps a credit without a page as plain text', () => {
    render(<ImageryFacts body="Uranus" />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(BODY_IMAGERY.Uranus.credit)).toBeTruthy()
  })
})
