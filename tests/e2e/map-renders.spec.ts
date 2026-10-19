import { expect, test } from '@playwright/test'

test.describe('World map', () => {
  test('map container is present in the DOM after switching to Map mode', async ({ page }) => {
    await page.goto('/')
    // Globe is the default view — switch to flat map first
    await page.getByRole('button', { name: 'Map', exact: true }).click()
    // MapLibre renders into a div with class maplibregl-map
    const map = page.locator('.maplibregl-map')
    await expect(map).toHaveCount(1, { timeout: 15_000 })
  })

  test('no CSS filter or tint overlay sits over the map canvas (#41)', async ({ page }) => {
    // v1 graded the map with filter: sepia() on the container plus a copper ::after
    // overlay, which shifted every data layer's colour. The basemap is now rethemed
    // layer by layer, so nothing between the canvas and the screen may recolour it.
    await page.goto('/')
    await page.getByRole('button', { name: 'Map', exact: true }).click()
    const canvas = page.locator('.maplibregl-canvas')
    await expect(canvas).toBeVisible({ timeout: 15_000 })
    const recolouring = await canvas.evaluate((el) => {
      const found: string[] = []
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node)
        if (style.filter !== 'none') found.push(`${node.className} filter: ${style.filter}`)
        const after = getComputedStyle(node, '::after')
        if (
          after.content !== 'none' &&
          after.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
          after.position === 'absolute'
        ) {
          found.push(`${node.className}::after background: ${after.backgroundColor}`)
        }
      }
      return found
    })
    expect(recolouring).toEqual([])
  })

  test('globe renders on the default view', async ({ page }) => {
    await page.goto('/')
    // Globe is the default view. It is role="group", not role="img": the globe
    // holds focusable event and quake markers, and role="img" would hide those
    // descendants from assistive tech.
    await expect(page.getByRole('group', { name: /Orthographic globe/ })).toBeVisible({
      timeout: 10_000,
    })
  })
})
