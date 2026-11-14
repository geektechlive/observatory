/**
 * The console's Rest column must fit a phone (#226). At 390 px the Sky console's Rest grid
 * (`grid-template-columns: 1fr`, which is `minmax(auto, 1fr)`) took the Close Approaches
 * table's min-content width (530 px in a 358 px section), so every Rest panel ran off the
 * right edge. The table scrolls inside its own panel; the column never grows past the page.
 */
import { expect, type Page, test } from '@playwright/test'

const WIDTHS = [320, 390, 768] as const
const CONSOLES = ['earth', 'sun', 'sky', 'orbit'] as const

/** Twelve approaches with long designations, so the table is as wide as a real week's. */
function neoFeed() {
  const objects = Array.from({ length: 12 }, (_, i) => ({
    id: `n${String(i)}`,
    name: `(2026 TX${String(i + 10)}) long designation`,
    absolute_magnitude_h: 22,
    is_potentially_hazardous_asteroid: i % 3 === 0,
    estimated_diameter: {
      kilometers: { estimated_diameter_min: 0.1234, estimated_diameter_max: 0.2765 },
    },
    close_approach_data: [
      {
        close_approach_date: '2026-11-10',
        miss_distance: {
          kilometers: String(1_234_567 + i * 100_000),
          lunar: String(3.21 + i),
          astronomical: '0.0082',
        },
        relative_velocity: { kilometers_per_second: String(12.34 + i) },
      },
    ],
  }))
  return { element_count: objects.length, near_earth_objects: { '2026-11-10': objects } }
}

async function serveNeoFeed(page: Page) {
  await page.route('**/api/neo', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-Data-Age': '3600' },
      body: JSON.stringify(neoFeed()),
    }),
  )
}

for (const width of WIDTHS) {
  test.describe(`Rest column at ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 844 } })

    for (const view of CONSOLES) {
      test(`${view}: every Rest panel fits the viewport`, async ({ page }) => {
        await serveNeoFeed(page)
        await page.goto(`/#${view}`)
        const rest = page.getByRole('region', { name: `More ${view} panels` })
        await expect(rest).toBeAttached()
        if (view === 'sky') {
          await expect(rest.getByRole('table')).toBeVisible({ timeout: 20_000 })
        }
        await expect(rest.locator('> *').first()).toBeAttached({ timeout: 20_000 })

        const boxes = await rest.evaluate((el) => {
          const out = [{ name: 'section', ...(el.getBoundingClientRect().toJSON() as object) }]
          for (const child of Array.from(el.children)) {
            const r = child.getBoundingClientRect()
            out.push({ name: child.tagName, left: r.left, right: r.right, width: r.width } as never)
          }
          return out as { name: string; left: number; right: number }[]
        })
        for (const box of boxes) {
          expect(box.left, `${box.name} left`).toBeGreaterThanOrEqual(-0.5)
          expect(box.right, `${box.name} right`).toBeLessThanOrEqual(width + 0.5)
        }
        const scrollWidth = await page.evaluate(() => document.scrollingElement?.scrollWidth ?? 0)
        expect(scrollWidth).toBeLessThanOrEqual(width)
      })
    }
  })
}

test.describe('Close Approaches scroll cue at 390 px (#227)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the wrapper is a focusable region and its fade shows until the scroll end', async ({
    page,
  }) => {
    await serveNeoFeed(page)
    await page.goto('/#sky')
    const region = page.getByRole('region', { name: 'Close approaches table' })
    await expect(region.getByRole('table')).toBeVisible({ timeout: 20_000 })

    const maskOf = () => region.evaluate((el) => getComputedStyle(el).maskImage)
    await expect(region).toHaveAttribute('data-more', 'true')
    expect(await maskOf()).not.toBe('none')

    await region.focus()
    await expect(region).toBeFocused()

    // The ring must not be faded by the mask while the region has keyboard focus.
    expect(await region.evaluate((el) => el.matches(':focus-visible'))).toBe(true)
    expect(await maskOf()).toBe('none')
    // The site's focus ring (2px, the signal colour), not a faint 1px border line.
    const ring = await region.evaluate((el) => {
      const s = getComputedStyle(el)
      const probe = document.createElement('span')
      probe.style.color = 'var(--signal)'
      document.body.append(probe)
      const signal = getComputedStyle(probe).color
      probe.remove()
      return { width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor, signal }
    })
    expect(ring.width).toBe('2px')
    expect(ring.style).toBe('solid')
    expect(ring.color).toBe(ring.signal)
    await region.blur()
    await expect(region).toHaveAttribute('data-more', 'true')
    expect(await maskOf()).not.toBe('none')

    await region.evaluate((el) => {
      el.scrollLeft = el.scrollWidth
    })
    await expect(region).toHaveAttribute('data-more', 'false')
    expect(await maskOf()).toBe('none')
  })

  test('nothing to scroll on a wide screen: no fade', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await serveNeoFeed(page)
    await page.goto('/#sky')
    const region = page.getByRole('region', { name: 'Close approaches table' })
    await expect(region.getByRole('table')).toBeVisible({ timeout: 20_000 })
    await expect(region).toHaveAttribute('data-more', 'false')
  })
})
