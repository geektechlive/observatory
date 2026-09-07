/**
 * Per-source health contracts.
 *
 * The console used to report LIVE whenever no fetch had *thrown*, which meant a
 * source that returned a well-formed but empty payload read as healthy. Each
 * source therefore declares what "has usable data" means for it, plus how stale
 * its payload may get before it counts as degraded.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** One entry per fetcher in `src/lib/api` (quota/client are infrastructure, not sources). */
export type SourceName =
  | 'aircraft'
  | 'air-quality'
  | 'apod'
  | 'aurora'
  | 'buoys'
  | 'cme'
  | 'co2'
  | 'donki'
  | 'eonet'
  | 'epic'
  | 'exoplanets'
  | 'fireball'
  | 'fires'
  | 'gdacs'
  | 'geomag'
  | 'iss-tle'
  | 'launches'
  | 'mars-weather'
  | 'neo'
  | 'nws'
  | 'people-in-space'
  | 'planets'
  | 'quakes'
  | 'satellites'
  | 'sentry'
  | 'solar-activity'
  | 'solar-cycle'
  | 'solar-wind'
  | 'space-news'
  | 'sun-moon'
  | 'swpc-alerts'

export type SourceState = 'unknown' | 'ok' | 'degraded' | 'error'

export interface SourceContract {
  /** Human label for status readouts. */
  label: string
  /** Headline sources gate the console-wide LIVE indicator. */
  headline: boolean
  /** Payload older than this (per `X-Data-Age`) counts as degraded. */
  maxAgeMs: number
  /** Returns false when the payload parsed but carries nothing usable. */
  required: (data: unknown) => boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Truthy, and not an empty array or empty object. */
function hasContent(data: unknown): boolean {
  if (data === null || data === undefined || data === false || data === '') return false
  if (Array.isArray(data)) return data.length > 0
  if (isRecord(data)) return Object.keys(data).length > 0
  return true
}

function fieldPresent(data: unknown, key: string): boolean {
  if (!isRecord(data)) return false
  const value = data[key]
  return value !== null && value !== undefined
}

function nonEmptyStringField(data: unknown, key: string): boolean {
  if (!isRecord(data)) return false
  const value = data[key]
  return typeof value === 'string' && value.length > 0
}

function nonEmptyArrayField(data: unknown, key: string): boolean {
  if (!isRecord(data)) return false
  const value = data[key]
  return Array.isArray(value) && value.length > 0
}

export const SOURCES: Record<SourceName, SourceContract> = {
  aircraft: { label: 'Aircraft', headline: false, maxAgeMs: 5 * MINUTE, required: hasContent },
  'air-quality': {
    label: 'Air Quality',
    headline: false,
    maxAgeMs: 3 * HOUR,
    required: hasContent,
  },
  apod: { label: 'APOD', headline: false, maxAgeMs: 2 * DAY, required: hasContent },
  aurora: { label: 'Aurora', headline: false, maxAgeMs: 2 * HOUR, required: hasContent },
  buoys: { label: 'Ocean Buoys', headline: false, maxAgeMs: 3 * HOUR, required: hasContent },
  cme: { label: 'CME', headline: false, maxAgeMs: 12 * HOUR, required: hasContent },
  co2: { label: 'CO2', headline: false, maxAgeMs: 30 * DAY, required: hasContent },
  donki: { label: 'DONKI', headline: false, maxAgeMs: 12 * HOUR, required: hasContent },
  eonet: { label: 'EONET Events', headline: true, maxAgeMs: 12 * HOUR, required: hasContent },
  epic: { label: 'EPIC', headline: false, maxAgeMs: 2 * DAY, required: hasContent },
  exoplanets: { label: 'Exoplanets', headline: false, maxAgeMs: 7 * DAY, required: hasContent },
  fireball: { label: 'Fireballs', headline: false, maxAgeMs: 2 * DAY, required: hasContent },
  fires: { label: 'Fires', headline: false, maxAgeMs: 12 * HOUR, required: hasContent },
  gdacs: { label: 'Disasters', headline: false, maxAgeMs: 6 * HOUR, required: hasContent },
  geomag: {
    label: 'Geomagnetic',
    headline: true,
    maxAgeMs: 3 * HOUR,
    required: (data) => fieldPresent(data, 'currentDst') && fieldPresent(data, 'currentBz'),
  },
  'iss-tle': {
    label: 'ISS TLE',
    headline: true,
    maxAgeMs: 36 * HOUR,
    required: (data) => nonEmptyStringField(data, 'line1') && nonEmptyStringField(data, 'line2'),
  },
  launches: { label: 'Launches', headline: true, maxAgeMs: 12 * HOUR, required: hasContent },
  'mars-weather': {
    label: 'Mars Weather',
    headline: false,
    maxAgeMs: 7 * DAY,
    required: hasContent,
  },
  neo: { label: 'Near-Earth Objects', headline: true, maxAgeMs: 2 * DAY, required: hasContent },
  nws: { label: 'NWS Alerts', headline: false, maxAgeMs: HOUR, required: hasContent },
  'people-in-space': {
    label: 'People In Space',
    headline: false,
    maxAgeMs: 7 * DAY,
    required: hasContent,
  },
  planets: { label: 'Planets', headline: false, maxAgeMs: DAY, required: hasContent },
  quakes: { label: 'Earthquakes', headline: true, maxAgeMs: 3 * HOUR, required: hasContent },
  satellites: {
    // Not headline: the only caller is `useSatellites(layers.satellites || tracking)`
    // and both operands are false on a default `#earth` load, so this source never
    // reports and would pin the console at SYNCING forever. Promote it back to
    // headline if the satellites layer ever defaults on or the hook goes
    // unconditional.
    label: 'Satellites',
    headline: false,
    maxAgeMs: 36 * HOUR,
    required: (data) => nonEmptyArrayField(data, 'satellites'),
  },
  sentry: { label: 'Sentry Risk', headline: false, maxAgeMs: 7 * DAY, required: hasContent },
  'solar-activity': {
    label: 'Solar Activity',
    headline: false,
    maxAgeMs: 12 * HOUR,
    required: hasContent,
  },
  'solar-cycle': {
    label: 'Solar Cycle',
    headline: false,
    maxAgeMs: 30 * DAY,
    required: hasContent,
  },
  'solar-wind': {
    label: 'Solar Wind',
    headline: true,
    maxAgeMs: 2 * HOUR,
    required: (data) => fieldPresent(data, 'currentKp') && fieldPresent(data, 'windSpeed'),
  },
  'space-news': { label: 'Space News', headline: false, maxAgeMs: 12 * HOUR, required: hasContent },
  'sun-moon': { label: 'Sun & Moon', headline: false, maxAgeMs: DAY, required: hasContent },
  'swpc-alerts': {
    label: 'SWPC Alerts',
    headline: false,
    maxAgeMs: 6 * HOUR,
    required: hasContent,
  },
}

export const SOURCE_NAMES = Object.keys(SOURCES) as SourceName[]

export const HEADLINE_SOURCES: SourceName[] = SOURCE_NAMES.filter((n) => SOURCES[n].headline)

export interface SourceMeta {
  degraded: boolean
  dataAgeSeconds: number | null
}

/**
 * Grades one successful fetch. Empty-but-valid payloads are `error`, because
 * that is exactly the failure the old "did it throw?" check missed.
 */
export function evaluateSource(name: SourceName, data: unknown, meta: SourceMeta): SourceState {
  const contract = SOURCES[name]
  if (!contract.required(data)) return 'error'
  if (meta.degraded) return 'degraded'
  if (meta.dataAgeSeconds !== null && meta.dataAgeSeconds * 1000 > contract.maxAgeMs) {
    return 'degraded'
  }
  return 'ok'
}

/**
 * Console-wide indicator. Stays `syncing` until every headline source has
 * reported, so a first paint never claims LIVE on data it does not have yet.
 */
export function deriveLiveStatus(
  map: Partial<Record<SourceName, SourceState>>,
): 'syncing' | 'live' | 'degraded' {
  const states = HEADLINE_SOURCES.map((name) => map[name] ?? 'unknown')
  if (states.some((s) => s === 'unknown')) return 'syncing'
  if (states.every((s) => s === 'ok')) return 'live'
  return 'degraded'
}
