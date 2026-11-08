/**
 * A mocked /api/trajectory answer (#145, reused by the guide's lessons, #159): samples
 * over the asked span on an Apophis-like ellipse, enough for the orrery to draw a
 * looked-up object and fly to it. Shared by the lookup and guide specs.
 */

/** Gauss's constant: the Sun's GM is its square, au³/day². */
const K = 0.01720209895

/**
 * Samples over the asked span, step and all, on an Apophis-like ellipse (a 0.92 au,
 * e 0.19, in the ecliptic): enough for the orrery to draw and fly to it (#145).
 */
export function ellipseSamples(jd0: number, stepDays: number, count: number): number[] {
  const a = 0.92
  const e = 0.19
  const n = Math.sqrt((K * K) / a ** 3)
  const out: number[] = []
  for (let i = 0; i < count; i += 1) {
    const M = n * (jd0 - 2461000.5 + i * stepDays)
    let E = M
    for (let k = 0; k < 20; k += 1) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    const dE = n / (1 - e * Math.cos(E))
    const b = a * Math.sqrt(1 - e * e)
    out.push(
      a * (Math.cos(E) - e),
      b * Math.sin(E),
      0.01,
      -a * Math.sin(E) * dE,
      b * Math.cos(E) * dE,
      0,
    )
  }
  return out
}

export function lookupTrajectory(
  object: { name: string },
  start: string,
  end: string,
  step = '1d',
) {
  const jd0 = Date.parse(`${start}T00:00:00Z`) / 86_400_000 + 2440587.5
  const stepDays = Number.parseInt(step, 10) || 1
  const count =
    Math.floor(
      (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / (stepDays * 86_400_000),
    ) + 1
  return {
    generatedAt: new Date().toISOString(),
    frame: 'ecliptic-J2000',
    center: 'Sun',
    timeScale: 'TDB',
    units: { position: 'au', velocity: 'au/day' },
    sourceType: 'ephemeris',
    provider: 'jpl-horizons',
    object,
    target: object.name,
    request: { start, end, stepMinutes: stepDays * 1440 },
    fine: { start: jd0, step: stepDays, samples: ellipseSamples(jd0, stepDays, count) },
    availableFrom: null,
    availableTo: null,
  }
}
