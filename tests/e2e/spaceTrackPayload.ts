/**
 * Mocked /api/spacetrack and /api/discos (#101): a re-entry predicted for Tiangong
 * (48274, in satPayload's stations group) two days from now, the Box Score, the ISS's
 * SATCAT row in its shard, and DISCOS facts for the ISS and Voyager 1.
 */
import type { Page } from '@playwright/test'

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

export async function serveSpaceTrack(page: Page): Promise<void> {
  const now = new Date().toISOString()
  const inTwoDays = `${new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 19)}Z`
  await page.route('**/api/spacetrack?part=catalog', (route) =>
    route.fulfill(
      json({
        generatedAt: now,
        provider: 'Space-Track.org',
        citation: 'Space-Track.org (USSPACECOM)',
        tip: {
          fetchedAt: now,
          reentries: [
            {
              noradId: '48274',
              decayEpoch: inTwoDays,
              windowMin: 720,
              msgEpoch: now.slice(0, 19) + 'Z',
              lat: null,
              lon: null,
              highInterest: false,
            },
          ],
        },
        decays: { fetchedAt: now, recent: [] },
        boxscore: {
          fetchedAt: now,
          inOrbit: {
            payload: 19870,
            rocketBody: 2434,
            debris: 12545,
            unassigned: 677,
            total: 35526,
          },
          decayed: { payload: 8415, rocketBody: 4494, debris: 22858, total: 35767 },
          catalogued: 71293,
        },
        satcatAt: now,
        names: { '48274': 'CSS (TIANHE)' },
        missing: [],
      }),
    ),
  )
  await page.route('**/api/spacetrack?part=satcat&shard=*', (route) =>
    route.fulfill(
      json({
        generatedAt: now,
        citation: 'Space-Track.org (USSPACECOM)',
        shard: 8,
        rows: [['25544', '1998-067A', 'PAYLOAD', 'ISS', '1998-11-20', 'TTMTR', 'LARGE']],
      }),
    ),
  )
  const object = (o: Record<string, unknown>) => ({
    satno: null,
    cosparId: null,
    objectClass: 'Payload',
    massKg: null,
    shape: null,
    widthM: null,
    heightM: null,
    depthM: null,
    diameterM: null,
    spanM: null,
    operators: [],
    firstEpoch: null,
    fetchedAt: now,
    ...o,
  })
  await page.route('**/api/discos', (route) =>
    route.fulfill(
      json({
        generatedAt: now,
        citation: 'ESA DISCOS (DISCOSweb)',
        craft: {
          '-31': object({
            cosparId: '1977-084A',
            name: 'Voyager 1',
            massKg: 817.64,
            operators: ['Jet Propulsion Lab'],
          }),
        },
        satellites: {
          '25544': object({
            satno: '25544',
            name: 'International Space Station',
            massKg: 450000,
            spanM: 108.5,
          }),
        },
        missing: [],
      }),
    ),
  )
}
