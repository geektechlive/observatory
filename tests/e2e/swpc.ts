import type { Page } from '@playwright/test'

/**
 * The orrery fetches GOES SUVI's live Sun straight from NOAA (#105). Tests that aren't
 * about the Sun answer it with a 503, so they never wait on the network and the Sun
 * settles to its flat disc before anything is measured.
 */
export async function offlineSun(page: Page): Promise<void> {
  await page.route('https://services.swpc.noaa.gov/**', (route) =>
    route.fulfill({ status: 503, contentType: 'text/plain', body: 'test' }),
  )
}
