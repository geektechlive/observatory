/**
 * A mocked Voyager 1 for /api/orrery-bodies (#108, reused by the guide's lessons, #159): a
 * straight line through today, with a whole-mission span back past 2012 as the real
 * payload has (#93).
 */

const DAY_MS = 86_400_000
const JD_UNIX = 2440587.5
const jdNow = () => Math.floor(Date.now() / DAY_MS) + JD_UNIX

export function voyager1() {
  const pos = [-32.2, -137.1, 99.2]
  const vel = [-0.0012, -0.00786, 0.00568]
  const at = (t: number) => pos.map((p, i) => p + (vel[i] ?? 0) * t)
  const fine: number[] = []
  for (let t = -30; t <= 30; t += 1) fine.push(...at(t), ...vel)
  // A whole-mission span back past 2012, as the real payload has (#93).
  const coarseStart = jdNow() - 6000
  const coarse: number[] = []
  for (let i = 0; i <= 61; i += 1) coarse.push(...at(coarseStart + i * 100 - jdNow()))
  return {
    id: 'naif:-31',
    naifId: '-31',
    name: 'Voyager 1',
    mission: 'Voyager 1 (test)',
    category: 'spacecraft',
    group: 'deep-space',
    target: 'Voyager 1 (spacecraft) (-31)',
    observedUntil: null,
    availableFrom: null,
    availableTo: null,
    fine: { start: jdNow() - 30, step: 1, samples: fine },
    coarse: { start: coarseStart, step: 100, samples: coarse },
  }
}
