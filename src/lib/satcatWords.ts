/**
 * Space-Track's catalogue and ESA DISCOS's facts in plain words (#101): the Box Score,
 * an object's kind, owner and radar size, a spacecraft's dimensions. Orrery-only: kept
 * apart from spaceTrackText.ts, which the ticker puts in the first load.
 */

const count = (n: number) => n.toLocaleString('en-US')

/** The Box Score as one sentence. */
export function boxscoreLine(b: {
  inOrbit: { payload: number; rocketBody: number; debris: number; total: number }
}): string {
  const o = b.inOrbit
  return (
    `Space-Track tracks ${count(o.total)} objects in orbit: ${count(o.payload)} satellites, ` +
    `${count(o.rocketBody)} rocket bodies and ${count(o.debris)} pieces of debris.`
  )
}

const TYPES: Readonly<Record<string, string>> = {
  PAYLOAD: 'Satellite or spacecraft',
  'ROCKET BODY': 'Rocket stage',
  DEBRIS: 'Debris',
  TBA: 'Not yet identified',
  UNKNOWN: 'Unknown',
}

/** SATCAT owner codes for the commonest owners; the rest show as Space-Track writes them. */
const OWNERS: Readonly<Record<string, string>> = {
  US: 'United States',
  CIS: 'Russia (CIS, the former USSR)',
  PRC: 'China',
  ISS: 'International Space Station partners',
  JPN: 'Japan',
  IND: 'India',
  ESA: 'European Space Agency',
  FR: 'France',
  UK: 'United Kingdom',
  GER: 'Germany',
  CA: 'Canada',
  IT: 'Italy',
}

/** SATCAT's COUNTRY (the owner) in plain words, keeping the code. */
export function ownerText(code: string): string {
  const name = OWNERS[code.toUpperCase()]
  return name ? `${name} (${code})` : code
}

/** SATCAT's OBJECT_TYPE in plain words. */
export function objectTypeText(type: string): string {
  return TYPES[type.toUpperCase()] ?? type
}

/**
 * SATCAT's RCS_SIZE, a scaled radar cross-section. Space-Track's documentation: "RCS_SIZE
 * has 3 values: Small (< 0.1m), Medium (0.1m – 1m), & Large (>1m)".
 */
export function rcsText(size: string): string | null {
  switch (size.toUpperCase()) {
    case 'SMALL':
      return 'Small on radar (under 0.1 m)'
    case 'MEDIUM':
      return 'Medium on radar (0.1 to 1 m)'
    case 'LARGE':
      return 'Large on radar (over 1 m)'
    default:
      return null
  }
}

const m = (v: number) => String(Math.round(v * 10) / 10)

/** DISCOS dimensions as the parts it has: a box, or a cylinder, and its span. */
export function discosSize(o: {
  widthM: number | null
  heightM: number | null
  depthM: number | null
  diameterM: number | null
  spanM: number | null
}): string | null {
  const parts: string[] = []
  if (o.widthM !== null && o.heightM !== null && o.depthM !== null) {
    parts.push(`${m(o.widthM)} × ${m(o.heightM)} × ${m(o.depthM)} m`)
  } else {
    if (o.diameterM !== null) parts.push(`${m(o.diameterM)} m wide`)
    if (o.heightM !== null) parts.push(`${m(o.heightM)} m tall`)
  }
  if (o.spanM !== null) parts.push(`${m(o.spanM)} m across`)
  return parts.length > 0 ? parts.join(', ') : null
}
