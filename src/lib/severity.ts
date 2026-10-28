/**
 * One set of severity thresholds for every surface (ROCI v2 spec section 4, #38).
 *
 * Before this, Kp, Dst, flare class, Bz and quake magnitude were coloured by
 * seven copies of the same idea with different cut-offs (the spine called Dst
 * -50 a hazard; the geomag panel waited for -100). Severity is a three-step
 * status scale, and status always ships with an icon and a label, never colour alone.
 */

export type Status = 'nominal' | 'watch' | 'hazard'

/** NOAA G-scale: G1 (minor storm) starts at Kp 5, G3 (strong) at Kp 7. */
export function kpStatus(kp: number): Status {
  if (kp >= 7) return 'hazard'
  if (kp >= 5) return 'watch'
  return 'nominal'
}

/** Dst storm classes: moderate at -50 nT, intense at -100 nT. */
export function dstStatus(dst: number): Status {
  if (dst <= -100) return 'hazard'
  if (dst <= -50) return 'watch'
  return 'nominal'
}

export function flareStatus(cls: string | null): Status | null {
  if (!cls) return null
  const letter = cls[0]?.toUpperCase()
  if (letter === 'X') return 'hazard'
  if (letter === 'M') return 'watch'
  return 'nominal'
}

/** Southward IMF couples into the magnetosphere; any negative Bz is worth watching. */
export function bzStatus(bz: number): Status {
  return bz < 0 ? 'watch' : 'nominal'
}

export function quakeStatus(magnitude: number): Status {
  if (magnitude >= 6) return 'hazard'
  if (magnitude >= 4.5) return 'watch'
  return 'nominal'
}

/**
 * USGS odds of at least one aftershock in the next week (#76): hazard at a 10% chance
 * of an M6+ (a damaging one), watch at a 10% chance of an M5+.
 */
export function aftershockStatus(week: { m5: number; m6: number }): Status {
  if (week.m6 >= 0.1) return 'hazard'
  if (week.m5 >= 0.1) return 'watch'
  return 'nominal'
}

/** Palermo scale: above -2 merits careful monitoring (CNEOS). */
export function palermoStatus(ps: number): Status {
  return ps > -2 ? 'hazard' : 'nominal'
}

/** NOAA R, S and G scale numbers, 0 (none) to 5 (extreme). */
export function noaaScaleStatus(n: number): Status {
  if (n >= 3) return 'hazard'
  if (n >= 1) return 'watch'
  return 'nominal'
}

export function gdacsStatus(level: string): Status {
  const l = level.toLowerCase()
  if (l === 'red') return 'hazard'
  if (l === 'orange') return 'watch'
  return 'nominal'
}

export type NwsTier = 'extreme' | 'severe' | 'moderate' | 'minor' | 'unknown'

/** NWS has four severities and the status scale three steps, so hazard keeps a tier for its glyph. */
export function nwsStatus(severity: string): { status: Status; tier: NwsTier } {
  switch (severity) {
    case 'Extreme':
      return { status: 'hazard', tier: 'extreme' }
    case 'Severe':
      return { status: 'hazard', tier: 'severe' }
    case 'Moderate':
      return { status: 'watch', tier: 'moderate' }
    case 'Minor':
      return { status: 'watch', tier: 'minor' }
    default:
      return { status: 'nominal', tier: 'unknown' }
  }
}

const STATUS_VAR: Record<Status, string> = {
  nominal: 'var(--terminal)',
  watch: 'var(--amber)',
  hazard: 'var(--mcrn)',
}

/** CSS colour for a status; null (no reading) is quiet ink, not a status. */
export function statusVar(status: Status | null): string {
  return status ? STATUS_VAR[status] : 'var(--bone-dim)'
}
