/**
 * The spans a looked-up object's samples come in (#145, #215), shared by the orrery that
 * asks for them and /api/trajectory, which takes no other (#223): every new span is a
 * Horizons request against the jpl-queue's daily budget, so a free choice of start, end and
 * step would let one script spend it for everyone. No imports: /api/trajectory reads this
 * through `jplLookup.ts`, and the orrery through `lookupTrack.ts`.
 *
 * - The 2-day span: two years around the sim date, its centre on a 120-day grid.
 * - The dense span: four days at 10 minutes around a close pass, from one interior 2-day
 *   sample to the one two samples later.
 */

/** /api/trajectory's dates: Horizons covers most small bodies across this range. */
export const FIRST_DAY = '1900-01-01'
export const LAST_DAY = '2100-12-31'

/** Days between samples. */
export const LOOKUP_STEP_DAYS = 2
/** Days either side of the span's centre: 366 samples, inside the endpoint's 600. */
const HALF_SPAN_DAYS = 365
/** The span's centre moves on this grid, days; the date is always ≥ 305 days from an end. */
const GRID_DAYS = 120
/** The dense span (#215): 10-minute samples over two 2-day steps, 577 samples. */
const CLOSEST_STEP_MINUTES = 10
const CLOSEST_SPAN_DAYS = 2 * LOOKUP_STEP_DAYS
const DAY_MS = 86_400_000

export interface LookupSpan {
  /** YYYY-MM-DD, as /api/trajectory takes them. */
  start: string
  end: string
  /** `<n>d` or `<n>m`. */
  step: string
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

/** The 2-day span to ask for around a sim time, or null outside 1900–2100. */
export function lookupSpan(simMs: number): LookupSpan | null {
  const first = dayMs(FIRST_DAY)
  const last = dayMs(LAST_DAY)
  if (!(simMs >= first && simMs < last + DAY_MS)) return null
  const day = Math.floor(simMs / DAY_MS)
  const centre = (Math.floor(day / GRID_DAYS) * GRID_DAYS + GRID_DAYS / 2) * DAY_MS
  let start = centre - HALF_SPAN_DAYS * DAY_MS
  let end = centre + HALF_SPAN_DAYS * DAY_MS
  if (start < first) {
    start = first
    end = first + 2 * HALF_SPAN_DAYS * DAY_MS
  } else if (end > last) {
    end = last
    start = last - 2 * HALF_SPAN_DAYS * DAY_MS
  }
  return { start: isoDay(start), end: isoDay(end), step: `${String(LOOKUP_STEP_DAYS)}d` }
}

/** The dense span starting on a 2-day sample's day (YYYY-MM-DD). */
export function closestSpanFrom(startDay: string): LookupSpan {
  return {
    start: startDay,
    end: isoDay(dayMs(startDay) + CLOSEST_SPAN_DAYS * DAY_MS),
    step: `${String(CLOSEST_STEP_MINUTES)}m`,
  }
}

/**
 * The 2-day spans that may hold a date: one per grid cell within a span's reach, each
 * built by `lookupSpan` itself (sim times clamped to 1900–2100, so the clamped spans at
 * either end are among them). Nine at most, so a request's check stays cheap.
 */
function gridSpansNear(ms: number): LookupSpan[] {
  const first = dayMs(FIRST_DAY)
  const last = dayMs(LAST_DAY)
  const spans: LookupSpan[] = []
  const reach = (HALF_SPAN_DAYS + GRID_DAYS) * DAY_MS
  for (let t = ms - reach; t <= ms + reach; t += GRID_DAYS * DAY_MS) {
    const s = lookupSpan(Math.min(Math.max(t, first), last))
    if (s) spans.push(s)
  }
  return spans
}

/**
 * Whether a request is a span the orrery asks for: a 2-day span `lookupSpan` builds, or a
 * dense span from an interior sample of one (start and end both on its 2-day samples).
 * Dates are YYYY-MM-DD; the step is in minutes.
 */
export function isLookupSpan(start: string, end: string, stepMinutes: number): boolean {
  const startMs = dayMs(start)
  const endMs = dayMs(end)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false
  if (stepMinutes === LOOKUP_STEP_DAYS * 1440) {
    return gridSpansNear(startMs).some((g) => g.start === start && g.end === end)
  }
  if (stepMinutes !== CLOSEST_STEP_MINUTES) return false
  if (closestSpanFrom(start).end !== end) return false
  return gridSpansNear(startMs).some((g) => {
    const offset = (startMs - dayMs(g.start)) / DAY_MS
    return offset >= 0 && endMs <= dayMs(g.end) && offset % LOOKUP_STEP_DAYS === 0
  })
}
