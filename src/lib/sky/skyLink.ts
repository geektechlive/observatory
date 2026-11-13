/**
 * The sky view's shareable link (#99 item 5): `#sky?target=sbc:<SPK-ID>&t=<ISO UTC>`.
 *
 * - `target` is the orrery's key for a small body (`sbc:<SPK-ID>`: comets, interstellar
 *   objects, bright asteroids and Ceres). The Tonight slice names the same objects
 *   `sb:<SPK-ID>`, and `sb:` in the orrery means a close approach, so the link follows the
 *   orrery. The view looks the target up in the Tonight slice only; a key the slice lacks
 *   is reported, not guessed at.
 * - `t` is a moment (ISO, UTC) to show the sky for, written to the second. Without it the
 *   view is live. A link from the orrery carries the orrery clock's time here.
 *
 * The console owns the hash while the sky view is open (useHashView keeps these two params
 * and drops the rest). Lazy: nothing in the first load imports this.
 */

export interface SkyLink {
  target: string | null
  t: number | null
}

const TARGET = /^sbc:\d{1,12}$/
const TONIGHT_ID = /^sb:(\d{1,12})$/
const ISO = /^[+-]?\d{4,6}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?$/

function decode(s: string): string | null {
  try {
    return decodeURIComponent(s)
  } catch {
    return null
  }
}

function parseTime(raw: string): number | null {
  if (!ISO.test(raw)) return null
  const ms = Date.parse(raw.endsWith('Z') ? raw : `${raw}Z`)
  return Number.isFinite(ms) ? ms : null
}

/** The link's values; null for each one that is missing or not understood. */
export function parseSkyLink(hash: string): SkyLink {
  const out: SkyLink = { target: null, t: null }
  const [view = '', query] = hash.replace(/^#\/?/, '').split('?')
  if (view.toLowerCase() !== 'sky' || query === undefined) return out
  for (const part of query.split('&')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const value = decode(part.slice(eq + 1))?.trim()
    if (!value) continue
    const key = part.slice(0, eq)
    if (key === 'target' && TARGET.test(value)) out.target = value
    else if (key === 't') out.t = parseTime(value)
  }
  return out
}

/** The colon stays readable (`sbc:20000004`). */
const encode = (s: string) => encodeURIComponent(s).replaceAll('%3A', ':')

export function serialiseSkyLink(link: SkyLink): string {
  if (link.target === null) return '#sky'
  const parts = [`target=${encode(link.target)}`]
  if (link.t !== null) {
    parts.push(
      `t=${new Date(Math.floor(link.t / 1000) * 1000).toISOString().replace('.000Z', 'Z')}`,
    )
  }
  return `#sky?${parts.join('&')}`
}

/** The link key for an object of the Tonight slice (`sb:<SPK-ID>` there, `sbc:` here). */
export function targetOfTonightId(id: string): string | null {
  const match = TONIGHT_ID.exec(id)
  return match ? `sbc:${match[1] ?? ''}` : null
}
