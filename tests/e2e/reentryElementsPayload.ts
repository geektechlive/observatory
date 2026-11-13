/**
 * Starlinks that Space-Track predicts will come down (#154): the catalogue body carries
 * their TIP messages and, in `tip.elements`, the elements the refresh job asked for in the
 * same session. Synthetic: no live call was made. Starlink is in no default switch, and
 * nothing here is in satPayload's groups, so only the elements can draw them.
 */
import type { Page } from '@playwright/test'

import { serveSpaceTrack } from './spaceTrackPayload'

export const REENTRY_ID = '53630'
export const REENTRY_NAME = 'STARLINK-4598'

/** `count` predictions (2026-11-07 had five), spread round the orbit and the sky. */
export async function serveStarlinkReentry(page: Page, count = 1): Promise<void> {
  await serveSpaceTrack(page)
  const now = new Date()
  const iso = now.toISOString()
  const epoch = new Date(now.getTime() - 3_600_000).toISOString().slice(0, 23)
  const ids = Array.from({ length: count }, (_, i) => String(Number(REENTRY_ID) + i))
  const nameOf = (i: number) => (i === 0 ? REENTRY_NAME : `STARLINK-${String(4598 + i * 37)}`)
  const reentries = ids.map((noradId, i) => ({
    noradId,
    decayEpoch: `${new Date(now.getTime() + (i + 1) * 86_400_000).toISOString().slice(0, 19)}Z`,
    windowMin: 720,
    msgEpoch: `${iso.slice(0, 19)}Z`,
    lat: null,
    lon: null,
    highInterest: false,
  }))
  // Low circular orbits (a mean motion near 16 rev/day), like Starlinks on their way down.
  const elements = ids.map((id, i) => [
    nameOf(i),
    id,
    '2021-099Z',
    epoch,
    15.98,
    0.0004,
    53.05,
    (120 + i * 71) % 360,
    80,
    (40 + i * 72) % 360,
    0.0006,
    0.0002,
    0,
  ])
  await page.route('**/api/spacetrack?part=catalog', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generatedAt: iso,
        provider: 'Space-Track.org',
        citation: 'Space-Track.org (USSPACECOM)',
        tip: { fetchedAt: iso, reentries, elements },
        decays: { fetchedAt: iso, recent: [] },
        boxscore: null,
        satcatAt: iso,
        names: Object.fromEntries(ids.map((id, i) => [id, nameOf(i)])),
        missing: [],
      }),
    }),
  )
}
