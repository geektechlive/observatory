// The one fetch the queue runs (#100): JPL hosts only, a deadline per attempt, and a
// short backoff when JPL says it is busy (503, as Horizons answers overlapping calls,
// or 429). It never proxies anywhere else, so the Durable Object can't become an open
// relay even if something other than our Pages Functions reached it.

const JPL_HOSTS: ReadonlySet<string> = new Set(['ssd.jpl.nasa.gov', 'ssd-api.jpl.nasa.gov'])

const TIMEOUT_MS = 15_000
const RETRIES = 2
/** Waits before the first and second retry, when JPL gives no Retry-After. */
const BACKOFF_MS = [2000, 5000]
/** A longer Retry-After than this would hold the whole queue; wait this long instead. */
const MAX_RETRY_AFTER_MS = 10_000

export function isJplUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  return (
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    url.port === '' &&
    JPL_HOSTS.has(url.hostname)
  )
}

/** JPL could not be reached, or the URL was not JPL's. */
export class JplFetchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JplFetchError'
  }
}

export interface JplAnswer {
  status: number
  body: string
  contentType: string | null
  attempts: number
}

export interface FetchDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>
  sleep: (ms: number) => Promise<void>
}

const busy = (status: number) => status === 503 || status === 429

function waitFor(attempt: number, res: Response | null): number {
  const header = res?.headers.get('Retry-After')
  const seconds = header ? Number(header) : Number.NaN
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
  return BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1] ?? 0
}

/**
 * Fetch a JPL URL, retrying a busy answer or a network failure up to twice. The last
 * busy answer is returned as is; a network failure on every attempt throws.
 */
export async function fetchJpl(url: string, deps: FetchDeps): Promise<JplAnswer> {
  if (!isJplUrl(url)) throw new JplFetchError('Not a JPL URL')
  let lastError = 'unknown'
  for (let attempt = 1; attempt <= RETRIES + 1; attempt += 1) {
    let res: Response | null = null
    try {
      res = await deps.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    if (res && (!busy(res.status) || attempt > RETRIES)) {
      return {
        status: res.status,
        body: await res.text(),
        contentType: res.headers.get('Content-Type'),
        attempts: attempt,
      }
    }
    if (attempt <= RETRIES) await deps.sleep(waitFor(attempt, res))
  }
  throw new JplFetchError(`JPL unreachable: ${lastError}`)
}
