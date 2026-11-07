/**
 * Keeps the orrery's live Sun image current (#105): fetch SUVI's frame list, load the
 * newest frame, and say what happened. Refreshes every 10 minutes between start() and
 * stop(), which the renderer ties to its canvas being attached. Any failure leaves the
 * flat disc, and the inspector says why.
 */
import { latestSuviFrame, SUVI_LIST_URL, SUVI_REFRESH_MS, type SuviFrame } from '@/lib/orrery/suvi'

export type SunImageState =
  | { kind: 'loading' }
  | { kind: 'live'; frame: SuviFrame; image: HTMLImageElement }
  | { kind: 'fallback'; reason: string }

export interface SunImageDeps {
  fetchJson: (url: string) => Promise<Response>
  loadImage: (url: string) => Promise<HTMLImageElement>
  onChange: (state: SunImageState) => void
}

/** Loads an image for WebGL: CORS mode, so the canvas is never tainted. */
export function loadCorsImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => {
      resolve(img)
    }
    img.onerror = () => {
      reject(new Error(`image failed: ${url}`))
    }
    img.src = url
  })
}

export class SunImage {
  private timer: ReturnType<typeof setInterval> | null = null
  /** The last frame shown: a refresh that finds the same frame does nothing. */
  private shown: string | null = null

  private readonly deps: SunImageDeps

  constructor(deps: SunImageDeps) {
    this.deps = deps
  }

  start(): void {
    if (this.timer !== null) return
    void this.refresh()
    this.timer = setInterval(() => void this.refresh(), SUVI_REFRESH_MS)
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }

  async refresh(): Promise<void> {
    let frame: SuviFrame | null
    try {
      const res = await this.deps.fetchJson(SUVI_LIST_URL)
      if (!res.ok) throw new Error(`list ${String(res.status)}`)
      frame = latestSuviFrame(await res.json())
    } catch {
      this.fail('NOAA’s frame list did not load.')
      return
    }
    if (!frame) {
      this.fail('NOAA’s frame list was not in the expected shape.')
      return
    }
    if (frame.url === this.shown) return
    try {
      const image = await this.deps.loadImage(frame.url)
      this.shown = frame.url
      this.deps.onChange({ kind: 'live', frame, image })
    } catch {
      this.fail('The live image did not load.')
    }
  }

  /** A failed refresh keeps a live image already shown; only a first failure falls back. */
  private fail(reason: string): void {
    if (this.shown !== null) return
    this.deps.onChange({ kind: 'fallback', reason })
  }
}
