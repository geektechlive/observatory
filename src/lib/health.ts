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
  | 'aftershocks'
  | 'aircraft'
  | 'air-quality'
  | 'apod'
  | 'aurora'
  | 'buoys'
  | 'cme'
  | 'comets-tonight'
  | 'discos'
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
  | 'jpl-lookup'
  | 'jpl-trajectory'
  | 'launches'
  | 'mars-weather'
  | 'neo'
  | 'nws'
  | 'orrery-bodies'
  | 'orrery-dwarfs'
  | 'orrery-neo'
  | 'orrery-sats'
  | 'orrery-smallbodies'
  | 'people-in-space'
  | 'planets'
  | 'quakes'
  | 'satellites'
  | 'sentry'
  | 'solar-activity'
  | 'solar-cycle'
  | 'solar-regions'
  | 'solar-wind'
  | 'space-news'
  | 'spacetrack'
  | 'sun-moon'
  | 'swpc-alerts'
  | 'weather'

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

/** A satellite group's optional SupGP count (#209) is a whole number within its rows. */
function supgpCountFits(data: unknown): boolean {
  if (!isRecord(data) || data['supgpCount'] === undefined) return true
  const count = data['supgpCount']
  const rows = data['rows']
  return (
    typeof count === 'number' &&
    Number.isInteger(count) &&
    count >= 0 &&
    Array.isArray(rows) &&
    count <= rows.length
  )
}

/** An SBDB answer (#148): "not found", a non-empty list, or one object with its SPK-ID. */
function lookupAnswered(result: unknown): boolean {
  if (!isRecord(result)) return false
  if (result['type'] === 'none') return true
  if (result['type'] === 'list') return nonEmptyArrayField(result, 'matches')
  return result['type'] === 'object' && nonEmptyStringField(result['object'], 'spkid')
}

/** A sampled span with at least one whole sample of position and velocity (#148). */
function wholeSamples(fine: unknown): boolean {
  if (!isRecord(fine)) return false
  const samples = fine['samples']
  return Array.isArray(samples) && samples.length > 0 && samples.length % 6 === 0
}

export const SOURCES: Record<SourceName, SourceContract> = {
  aftershocks: {
    // Most weeks no recent quake has a USGS forecast, so an empty list is a real answer.
    label: 'Aftershock Odds',
    headline: false,
    maxAgeMs: 3 * HOUR,
    required: (data) => isRecord(data) && Array.isArray(data['forecasts']),
  },
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
  discos: {
    // Not headline: only the inspector asks (#101). Each object is asked weekly; the 15
    // orrery craft are always there, so no craft means a broken refresh.
    label: 'ESA DISCOS',
    headline: false,
    maxAgeMs: 14 * DAY,
    required: (data) => isRecord(data) && hasContent(data['craft']),
  },
  donki: { label: 'DONKI', headline: false, maxAgeMs: 12 * HOUR, required: hasContent },
  eonet: { label: 'EONET Events', headline: true, maxAgeMs: 12 * HOUR, required: hasContent },
  epic: { label: 'EPIC', headline: false, maxAgeMs: 2 * DAY, required: hasContent },
  exoplanets: { label: 'Exoplanets', headline: false, maxAgeMs: 7 * DAY, required: hasContent },
  fireball: {
    // Built by the refresh job into KV every run (#146); an empty list is a broken refresh.
    label: 'Fireballs',
    headline: false,
    maxAgeMs: 2 * DAY,
    required: (data) => nonEmptyArrayField(data, 'data'),
  },
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
  // The orrery search's on-demand JPL answers (#100, #148). Not headline: only a search
  // asks, so a cold load never would. Both cache a day; the predicates live here, and
  // src/lib/api/jplLookup.ts refuses an answer that fails them.
  'jpl-lookup': {
    // "Not found" is a real answer; a list must list something, an object must have its id.
    label: 'JPL Lookup',
    headline: false,
    maxAgeMs: 2 * DAY,
    required: (data) => isRecord(data) && lookupAnswered(data['result']),
  },
  'jpl-trajectory': {
    // Whole samples (six numbers each), or no samples but where the ephemeris ends.
    label: 'JPL Trajectory',
    headline: false,
    maxAgeMs: 2 * DAY,
    required: (data) =>
      isRecord(data) &&
      nonEmptyStringField(data['object'], 'spkid') &&
      (wholeSamples(data['fine']) ||
        (data['fine'] === null &&
          (nonEmptyStringField(data, 'availableFrom') ||
            nonEmptyStringField(data, 'availableTo')))),
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
  'orrery-bodies': {
    // Headline for the orrery view only (#93, #178). Sampled from JPL Horizons by the
    // refresh job every 6 h; spans run 30 days either side, so 72 h is still sound.
    label: 'Orrery Bodies',
    headline: true,
    maxAgeMs: 72 * HOUR,
    required: (data) => nonEmptyArrayField(data, 'bodies'),
  },
  'orrery-dwarfs': {
    // Not headline: fetched only when the Dwarf planets switch or a link asks (#99 item 8),
    // so no view always shows it (ADR 0018). Pluto's span covers the whole clock and the
    // job keeps a body's last span when JPL fails, so an empty list is a fault.
    label: 'Orrery Dwarf Planets',
    headline: false,
    maxAgeMs: 72 * HOUR,
    required: (data) => nonEmptyArrayField(data, 'dwarfs'),
  },
  'orrery-neo': {
    // Headline for the orrery view only (#92, #178). CAD finds dozens of objects inside
    // 0.05 au in any 20-day window, so an empty list means a broken refresh.
    label: 'Orrery Close Approaches',
    headline: true,
    maxAgeMs: 36 * HOUR,
    required: (data) => nonEmptyArrayField(data, 'approaches'),
  },
  'orrery-smallbodies': {
    // Not headline: only the orrery page asks for it (#99). Comets can be few or none in
    // a quiet month, but 1I, 2I and 3I are always there, so an empty list is a fault.
    label: 'Orrery Comets',
    headline: false,
    maxAgeMs: 72 * HOUR,
    required: (data) => nonEmptyArrayField(data, 'interstellar'),
  },
  'comets-tonight': {
    // Not headline: the Sky view fetches it only once a visitor shares a location (#135).
    // Cut from the comet payload, where 2I and 3I always carry a magnitude law, so an
    // empty list is a fault.
    label: 'Comets Tonight',
    headline: false,
    maxAgeMs: 72 * HOUR,
    required: (data) => nonEmptyArrayField(data, 'comets'),
  },
  'orrery-sats': {
    // Not headline: only the orrery page asks for it (#98). One CelesTrak group per
    // request, refreshed every 6 h; SGP4 elements are good for days, so 36 h is sound.
    label: 'Orrery Satellites',
    headline: false,
    maxAgeMs: 36 * HOUR,
    // Starlink's supgpCount (#209), when present, counts its leading SupGP rows.
    required: (data) => nonEmptyArrayField(data, 'rows') && supgpCountFits(data),
  },
  'people-in-space': {
    label: 'People In Space',
    headline: false,
    maxAgeMs: 7 * DAY,
    required: hasContent,
  },
  planets: {
    // Built by the refresh job into KV every run (#146), for that run's UTC date, so a
    // copy past a day is for another date.
    label: 'Planets',
    headline: false,
    maxAgeMs: DAY,
    required: (data) => nonEmptyArrayField(data, 'bodies'),
  },
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
  sentry: {
    // Built by the refresh job into KV every run (#146); the list changes rarely.
    label: 'Sentry Risk',
    headline: false,
    maxAgeMs: 2 * DAY,
    required: (data) => nonEmptyArrayField(data, 'data'),
  },
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
  // SWPC active regions and flare odds (#210). Either half is usable alone (the server
  // marks a half answer degraded); a regions half must carry its list, which may be empty.
  'solar-regions': {
    label: 'Active Regions',
    headline: false,
    maxAgeMs: 12 * HOUR,
    required: (data) => {
      if (!isRecord(data)) return false
      const regions = data['regions']
      return (
        fieldPresent(data, 'probabilities') ||
        (isRecord(regions) && Array.isArray(regions['items']))
      )
    },
  },
  'solar-wind': {
    label: 'Solar Wind',
    headline: true,
    maxAgeMs: 2 * HOUR,
    required: (data) => fieldPresent(data, 'currentKp') && fieldPresent(data, 'windSpeed'),
  },
  'space-news': { label: 'Space News', headline: false, maxAgeMs: 12 * HOUR, required: hasContent },
  spacetrack: {
    // Not headline: only the satellite inspector, controls and ticker ask (#101). TIP is
    // asked every 6 h; some weeks nothing is coming down, so an empty list is an answer,
    // but no TIP part at all means the refresh never reached Space-Track.
    label: 'Space-Track',
    headline: false,
    maxAgeMs: 36 * HOUR,
    required: (data) => isRecord(data) && fieldPresent(data['tip'], 'reentries'),
  },
  'sun-moon': { label: 'Sun & Moon', headline: false, maxAgeMs: DAY, required: hasContent },
  'swpc-alerts': {
    label: 'SWPC Alerts',
    headline: false,
    maxAgeMs: 6 * HOUR,
    required: hasContent,
  },
  // Open-Meteo cloud cover (#79): only fetched once the user shares a location.
  weather: {
    label: 'Cloud Cover',
    headline: false,
    maxAgeMs: 3 * HOUR,
    required: (data) => isRecord(data) && nonEmptyArrayField(data['hourly'], 'time'),
  },
}

export const SOURCE_NAMES = Object.keys(SOURCES) as SourceName[]

export const HEADLINE_SOURCES: SourceName[] = SOURCE_NAMES.filter((n) => SOURCES[n].headline)

/** The views of the dial; kept here as a literal so this module stays import-free. */
export type HealthView = 'earth' | 'orrery' | 'sun' | 'sky' | 'orbit'

/**
 * What the header judges on each view (#178): the headline sources that view shows and that
 * a cold load of it always fetches. One list for the whole site never settled, because no
 * view mounts every hook. `tests/e2e/view-headlines.spec.ts` checks each view really asks
 * for its list, so a hook that stops mounting can't drop out of the judgement unseen.
 */
export const VIEW_HEADLINES: Readonly<Record<HealthView, readonly SourceName[]>> = {
  earth: ['eonet', 'quakes', 'iss-tle', 'solar-wind'],
  orrery: ['orrery-bodies', 'orrery-neo'],
  sun: ['solar-wind', 'geomag'],
  sky: ['neo'],
  orbit: ['iss-tle', 'launches'],
}

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
 * The header's indicator for the view on screen. Stays `syncing` until every one of that
 * view's headline sources has reported, so a first paint never claims LIVE on data it does
 * not have yet. Sources the view doesn't show are not judged (#178).
 */
export function deriveLiveStatus(
  map: Partial<Record<SourceName, SourceState>>,
  view: HealthView,
): 'syncing' | 'live' | 'degraded' {
  const states = VIEW_HEADLINES[view].map((name) => map[name] ?? 'unknown')
  if (states.some((s) => s === 'unknown')) return 'syncing'
  if (states.every((s) => s === 'ok')) return 'live'
  return 'degraded'
}
