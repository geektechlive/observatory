import type { Page } from '@playwright/test'

/**
 * Points inside the map's credit control that something else sits on top of, plus any lens
 * plate the control overlaps. In #94 the credits drew over the ISS plate, so a cover check
 * alone passed while both were unreadable.
 */
export async function coveredPoints(page: Page) {
  return page.locator('.maplibregl-ctrl-attrib').evaluate((el) => {
    const r = el.getBoundingClientRect()
    const overlaps = [...document.querySelectorAll('[data-lens-plates] > *')]
      .map((plate) => plate.getBoundingClientRect())
      .filter((p) => p.width > 0 && p.height > 0)
      .filter((p) => p.left < r.right && r.left < p.right && p.top < r.bottom && r.top < p.bottom)
      .map((p) => `overlaps plate at ${Math.round(p.left)},${Math.round(p.top)}`)
    const points: [number, number][] = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + 3, r.top + 3],
      [r.right - 3, r.top + 3],
      [r.left + 3, r.bottom - 3],
      [r.right - 3, r.bottom - 3],
    ]
    const covered = points
      .filter(([x, y]) => {
        const hit = document.elementFromPoint(x, y)
        return !hit || !el.contains(hit)
      })
      .map(([x, y]) => {
        const hit = document.elementFromPoint(x, y)
        return `${Math.round(x)},${Math.round(y)} ${hit?.className ?? 'nothing'}`
      })
    return [...covered, ...overlaps]
  })
}
