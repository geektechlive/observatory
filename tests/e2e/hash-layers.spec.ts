/**
 * A layers link draws its own layers from the first render (#176). The hash used to be
 * applied in useHashView's mount effect, after the first commit, so the default layers
 * mounted for one render: on `#orbit?layers=fires` that fetched /api/aurora, which no
 * Orbit panel uses, for an aurora layer the link turns off.
 */
import { expect, type Page, test } from '@playwright/test'

/** Every feed answers unavailable; only which ones were asked for matters here. */
async function recordFeeds(page: Page): Promise<string[]> {
  const asked: string[] = []
  await page.route('**/api/**', async (route) => {
    asked.push(new URL(route.request().url()).pathname)
    await route.fulfill({ status: 503, json: { error: 'mock' } })
  })
  return asked
}

async function expectNoAurora(page: Page, asked: string[]) {
  const fires = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/fires')
  await page.goto('/#orbit?layers=fires')
  await fires
  // The layer list starts folded, so its switches are out of the accessibility tree.
  await expect(page.locator('[role="switch"]', { hasText: 'Aurora' })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  // Every first-render query has started by now; give a late one a moment anyway.
  await page.waitForTimeout(500)
  expect(asked).not.toContain('/api/aurora')
}

test('a layers link never fetches a default layer it turns off', async ({ page }) => {
  const asked = await recordFeeds(page)
  await expectNoAurora(page, asked)
})

test('a layers link wins over saved layer preferences', async ({ page }) => {
  // A returning visitor who keeps the aurora on.
  await page.addInitScript(() => {
    localStorage.setItem(
      'observatory-ui',
      JSON.stringify({ state: { layers: { aurora: true, iss: true } }, version: 1 }),
    )
  })
  const asked = await recordFeeds(page)
  await expectNoAurora(page, asked)
})
