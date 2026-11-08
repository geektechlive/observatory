import { expect, test } from '@playwright/test'

import { VIEW_HEADLINES } from '../../src/lib/health'

// #178: the header judges each view by its own headline sources. That only holds while a cold
// load of the view really asks for every one of them; a hook that stopped mounting would
// otherwise drop out of the judgement unseen. Each source's endpoint is /api/<source name>.
for (const view of Object.keys(VIEW_HEADLINES) as (keyof typeof VIEW_HEADLINES)[]) {
  test(`a cold load of #${view} asks for each of its headline feeds (#178)`, async ({ page }) => {
    const asked = new Set<string>()
    page.on('request', (r) => {
      const path = new URL(r.url()).pathname
      if (path.startsWith('/api/')) asked.add(path.slice('/api/'.length))
    })
    await page.goto(`/#${view}`)
    await expect
      .poll(() => VIEW_HEADLINES[view].filter((s) => !asked.has(s)), { timeout: 15_000 })
      .toEqual([])
  })
}
