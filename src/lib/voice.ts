/**
 * The console's one "voice" sentence (Fraunces italic, one per view), written
 * from live data. Loading and failed feeds never produce a claim: loading reads
 * as neutral, and a failed primary feed says so plainly.
 */
import { flareStatus, kpStatus } from './severity'

export type VoiceView = 'earth' | 'sun' | 'sky' | 'orbit'

export type Feed<T> = { state: 'loading' } | { state: 'error' } | { state: 'ok'; data: T }

export interface VoiceInput {
  /** Quakes in the last 24 h. */
  quakes: Feed<{ mag: number | null; place: string }[]>
  kp: Feed<{ value: number | null }>
  /** Flare class strings such as "M2.3". */
  xray: Feed<{ currentClass: string | null; peakClass24h: string | null }>
  wind: Feed<{ speedKmS: number | null }>
  moon: Feed<{ phase: string; illuminationPct: number }>
  neo: Feed<{ countThisWeek: number }>
  people: Feed<{ count: number }>
  launch: Feed<{ name: string | null; hoursUntil: number | null }>
}

const QUAKE_MIN_MAG = 5
/** Kp 4 is "active"; Kp 5 and up is a storm, decided by severity.ts. */
const AURORA_KP = 4
const LOADING = 'Reading the instruments…'
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

/** Places on or near the Pacific Ring of Fire; deliberately a short, honest list. */
const RIM =
  /japan|indonesia|chile|alaska|fiji|tonga|philippines|papua|kuril|aleutian|vanuatu|peru|mexico|new zealand|honshu|kermadec|solomon|taiwan|kamchatka|samoa|ecuador|colombia|guatemala|el salvador|costa rica/i

const word = (n: number): string => WORDS[n] ?? String(n)
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many)

function earth({ quakes, kp }: VoiceInput): string {
  if (quakes.state === 'loading') return LOADING
  if (quakes.state === 'error')
    return 'Seismic feed is down; the rest of the Earth console is live.'
  const big = quakes.data.filter((q) => q.mag !== null && q.mag >= QUAKE_MIN_MAG)
  const n = big.length
  const rim = n > 0 && big.filter((q) => RIM.test(q.place)).length * 2 > n
  const head =
    n === 0
      ? 'No quakes above M5 today'
      : `${cap(word(n))} ${plural(n, 'quake', 'quakes')} above M5 ${rim ? 'along the Pacific rim' : 'today'}`
  return `${head}${auroraClause(kp)}.`
}

function auroraClause(kp: VoiceInput['kp']): string {
  if (kp.state !== 'ok' || kp.data.value === null) return ''
  if (kpStatus(kp.data.value) !== 'nominal') return ', and a geomagnetic storm is under way'
  if (kp.data.value >= AURORA_KP) return ', and the aurora may be visible at high latitudes'
  return ''
}

function sun({ xray, wind }: VoiceInput): string {
  if (xray.state === 'loading') return LOADING
  if (xray.state === 'error')
    return 'Solar X-ray feed is down; the rest of the Sun console is live.'
  const { currentClass, peakClass24h } = xray.data
  const speed = wind.state === 'ok' ? wind.data.speedKmS : null
  const windText = speed === null ? null : `${Math.round(speed)} km/s`
  const peak = flareStatus(peakClass24h)
  if (peak === 'watch' || peak === 'hazard') {
    const letter = (peakClass24h ?? '').charAt(0).toUpperCase()
    const tail = windText ? `, and the wind is at ${windText}` : ''
    return `An ${letter}-class flare in the last day${tail}.`
  }
  const current = currentClass ?? peakClass24h
  if (!current) return 'No X-ray class is reported right now.'
  const letter = current.charAt(0).toUpperCase()
  return `The Sun is quiet: ${letter}-class X-rays${windText ? ` and a ${windText} wind` : ''}.`
}

/** USNO's phase name ("First Quarter", "Full Moon") as the end of "The Moon is …". */
function phrasePhase(phase: string): string {
  const p = phase.toLowerCase().replace('third quarter', 'last quarter')
  if (p.endsWith('quarter')) return `at ${p}`
  return p.replace(/ moon$/, '')
}

function sky({ moon, neo }: VoiceInput): string {
  if (moon.state === 'loading') return LOADING
  if (moon.state === 'error') return 'Moon data is down; the rest of the Sky console is live.'
  const head = `The Moon is ${phrasePhase(moon.data.phase)}, ${Math.round(moon.data.illuminationPct)}% lit`
  if (neo.state !== 'ok') return `${head}.`
  const n = neo.data.countThisWeek
  const tail = `${word(n)} near-Earth ${plural(n, 'asteroid approaches', 'asteroids approach')} this week`
  return `${head}, and ${tail}.`
}

function countdown(hours: number): string {
  if (hours < 1) return 'under an hour'
  if (hours < 48 && hours % 24 !== 0) {
    const h = Math.round(hours)
    return `${h} ${plural(h, 'hour', 'hours')}`
  }
  const d = Math.floor(hours / 24)
  return `${d} ${plural(d, 'day', 'days')}`
}

function orbit({ people, launch }: VoiceInput): string {
  if (people.state === 'loading') return LOADING
  if (people.state === 'error') return 'Crew roster is down; the rest of the Orbit console is live.'
  const n = people.data.count
  const head = `${cap(word(n))} ${plural(n, 'person is', 'people are')} in space`
  if (launch.state !== 'ok') return `${head}.`
  const { name, hoursUntil } = launch.data
  if (name === null || hoursUntil === null || hoursUntil < 0) return `${head}.`
  return `${head}, and the next launch, ${name}, is in ${countdown(hoursUntil)}.`
}

const WRITERS: Record<VoiceView, (input: VoiceInput) => string> = { earth, sun, sky, orbit }

export function voiceFor(view: VoiceView, input: VoiceInput): string {
  return WRITERS[view](input)
}

interface QueryLike<D> {
  data: D | undefined
  isLoading: boolean
  error: unknown
}

/** A query as a voice feed: data wins, then an error, otherwise still loading. */
export function toFeed<D, T>(query: QueryLike<D>, pick: (data: D) => T): Feed<T> {
  if (query.data !== undefined) return { state: 'ok', data: pick(query.data) }
  if (query.error != null) return { state: 'error' }
  return { state: 'loading' }
}
