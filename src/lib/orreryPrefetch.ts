/**
 * Early loading of the orrery's code (#168).
 *
 * The orrery is a lazy page: OrreryPage, then (once it runs) OrreryRenderer and three.js.
 * Measured on production (2026-11-08, cold #orrery): the page started ~467 ms after boot
 * and the renderer ~531 ms after that, so the first 3D frame came at ~1.0 s on a fast link
 * and 5.9 s on a throttled phone. Each hop is a round trip, and a round trip is what a
 * phone pays most for.
 *
 * `prefetchOrrery` asks for the page and the renderer in the same breath. Vite wraps each
 * dynamic import with a preload of that chunk's own static imports, so three.js (the
 * renderer's) is requested together with the renderer, and nothing waits on a parent chunk.
 * It is called before React renders when the address is #orrery, when the visitor reaches
 * for the Orrery dial tab, and when the browser is idle after the Earth page has loaded.
 *
 * Keep this file free of the orrery's own imports: it is in the first load, and
 * check-bundle's `entry-has-no-orrery` rule fails the build if orrery code follows it in.
 */

export interface OrreryLoaders {
  page: () => Promise<unknown>
  renderer: () => Promise<unknown>
}

/** Both loaders at once, once; never rejects, and a failure may be tried again. */
export function createOrreryPrefetch(loaders: OrreryLoaders): () => Promise<void> {
  let started: Promise<void> | null = null
  return () => {
    started ??= Promise.all([loaders.page(), loaders.renderer()]).then(
      () => undefined,
      () => {
        started = null
      },
    )
    return started
  }
}

// One import() per chunk, shared with the lazy page in App.tsx and with OrreryPage's own
// renderer import: the browser keys modules by URL, so all of them are the same request.
export const loadOrreryPage = () => import('@/components/orrery/OrreryPage')
export const loadOrreryRenderer = () => import('@/components/orrery/three/OrreryRenderer')

export const prefetchOrrery = createOrreryPrefetch({
  page: loadOrreryPage,
  renderer: loadOrreryRenderer,
})

/**
 * Where the build lists the orrery's chunk files (vite.config.ts `orreryPreloadManifest`):
 * OrreryPage, OrreryRenderer and every chunk they import statically, three.js included.
 */
export const ORRERY_PRELOAD_MANIFEST = '/orrery-preload.json'

const CHUNK_PATH = /^\/assets\/[\w.-]+\.js$/

async function fetchPreloadManifest(): Promise<unknown> {
  const res = await fetch(ORRERY_PRELOAD_MANIFEST)
  if (!res.ok) throw new Error(`orrery preload manifest ${res.status}`)
  return res.json()
}

interface LinkPreloadOptions {
  fetchManifest?: () => Promise<unknown>
  doc?: Document
}

function readFiles(manifest: unknown): string[] | null {
  if (typeof manifest !== 'object' || manifest === null || !('files' in manifest)) return null
  const { files } = manifest
  if (!Array.isArray(files)) return null
  const paths = files.filter((f): f is string => typeof f === 'string' && CHUNK_PATH.test(f))
  return paths.length > 0 ? paths : null
}

/**
 * Download, and let the browser compile, the orrery's chunks without running them: one
 * `<link rel="modulepreload">` each. Unlike `import()` this adds no main-thread work, which
 * is what the hover and idle paths want on a phone. The real import later finds the modules
 * in the browser's module map. Never rejects; a failure may be tried again.
 */
export function createOrreryLinkPreload({
  fetchManifest = fetchPreloadManifest,
  doc = document,
}: LinkPreloadOptions = {}): () => Promise<void> {
  let started: Promise<void> | null = null
  return () => {
    started ??= fetchManifest().then(
      (manifest) => {
        const files = readFiles(manifest)
        if (files === null) {
          started = null
          return
        }
        const present = new Set(
          [...doc.querySelectorAll('link[rel="modulepreload"]')].map((l) => l.getAttribute('href')),
        )
        for (const href of files) {
          if (present.has(href)) continue
          const link = doc.createElement('link')
          link.rel = 'modulepreload'
          link.setAttribute('crossorigin', '')
          link.href = href
          doc.head.append(link)
        }
      },
      () => {
        started = null
      },
    )
    return started
  }
}

/** Hover, focus and idle use this; only a boot on #orrery really imports (`prefetchOrrery`). */
export const preloadOrreryLinks = createOrreryLinkPreload()

/** `#orrery`, `#/orrery` and `#orrery?t=…`, the way useHashView reads the view. */
export function isOrreryHash(hash: string): boolean {
  const [view = ''] = hash.replace(/^#\/?/, '').split('?')
  return view.toLowerCase() === 'orrery'
}

interface ConnectionHints {
  saveData?: boolean
  effectiveType?: string
}

/** The Network Information API, where the browser has it (not Safari or Firefox). */
export function currentConnection(): ConnectionHints | undefined {
  return (navigator as Navigator & { connection?: ConnectionHints }).connection
}

/** An idle fetch is a guess, so it is not made for a visitor saving data or on a slow link. */
export function shouldPrefetchOnIdle(connection: ConnectionHints | undefined): boolean {
  if (connection?.saveData === true) return false
  return connection?.effectiveType !== '2g' && connection?.effectiveType !== 'slow-2g'
}

/** Settling time after load, so the Earth globe's own upgrade (textures, WebGL) goes first. */
const IDLE_DELAY_MS = 3000
const IDLE_TIMEOUT_MS = 5000

interface IdleOptions {
  connection?: ConnectionHints | undefined
  idleDelayMs?: number
}

/** Prefetch once the page has settled and the browser is idle. Returns a cancel function. */
export function scheduleOrreryIdlePrefetch(
  prefetch: () => Promise<void> = preloadOrreryLinks,
  { connection = currentConnection(), idleDelayMs = IDLE_DELAY_MS }: IdleOptions = {},
): () => void {
  if (!shouldPrefetchOnIdle(connection)) return () => undefined
  let idle: number | undefined
  const run = () => {
    void prefetch()
  }
  const timer = window.setTimeout(() => {
    // Safari lacks requestIdleCallback even though the DOM typings claim it always exists.
    if ('requestIdleCallback' in window) {
      idle = window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS })
    } else {
      run()
    }
  }, idleDelayMs)
  return () => {
    window.clearTimeout(timer)
    if (idle !== undefined) window.cancelIdleCallback(idle)
  }
}
