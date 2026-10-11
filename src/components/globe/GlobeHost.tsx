import { type ComponentProps, useEffect, useRef, useState } from 'react'

import { useReducedMotion } from '@/hooks/useReducedMotion'
import { gpuTier } from '@/lib/globe3d'
import { chooseGlobeMode, type GlobeMode, readGlobeModeInput, readGpuInfo } from '@/lib/globeMode'

import { Globe } from './Globe'
import styles from './globe-host.module.css'
import type { GlobeRenderer } from './three/GlobeRenderer'

type GlobeProps = ComponentProps<typeof Globe>

/**
 * One renderer for the page's lifetime: Earth/Sun/Sky switches unmount this host, and
 * re-creating a WebGL context on every switch would churn GPU memory and eventually
 * hit the browser's context limit. Reset to null after a failure so nothing retries.
 */
let shared: Promise<GlobeRenderer> | null = null
let failed = false

function acquireRenderer(size: number, reducedMotion: boolean, warm: boolean, onLost: () => void) {
  if (!shared) {
    const tier = gpuTier(readGpuInfo())
    const w = String(tier.textureWidth)
    shared = import('./three/GlobeRenderer').then(({ GlobeRenderer }) =>
      GlobeRenderer.create({
        size,
        textures: { day: `/textures/day-${w}.webp`, night: `/textures/night-${w}.webp` },
        dprCap: tier.dprCap,
        reducedMotion,
        warm,
        onContextLost: onLost,
      }),
    )
  }
  return shared
}

function releaseAfterFailure(): void {
  failed = true
  void shared?.then((r) => {
    r.dispose()
  })
  shared = null
}

/**
 * The globe. The SVG globe is the first paint and the fallback; the three.js globe is
 * a lazy upgrade that crossfades in on its first frame (#46). WebGL is opt-in
 * (?globe=webgl) until the parity matrix (#44) is complete; see src/lib/globeMode.ts.
 * `data-globe-mode` says which one is live, so e2e can't pass silently on the fallback.
 */
export function GlobeHost(props: GlobeProps) {
  const [mode, setMode] = useState<GlobeMode>('svg')
  const slot = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  const size = props.size ?? 460
  const warm = props.warm ?? true

  useEffect(() => {
    if (failed || chooseGlobeMode(readGlobeModeInput()) !== 'webgl') return
    let cancelled = false
    let attached: GlobeRenderer | null = null

    const fallBack = (reason: unknown) => {
      console.warn('[globe] staying on the SVG globe:', reason)
      releaseAfterFailure()
      if (!cancelled) setMode('svg')
    }

    const start = () => {
      acquireRenderer(size, reducedMotion, warm, () => {
        fallBack('WebGL context lost')
      })
        .then((renderer) => {
          if (cancelled || !slot.current) return
          renderer.attach(slot.current)
          attached = renderer
          setMode('webgl')
        })
        .catch(fallBack)
    }

    // After idle: the SVG globe has painted; the upgrade never competes with first paint.
    // Safari lacks requestIdleCallback even though the DOM typings claim it always exists.
    const hasIdle = 'requestIdleCallback' in window
    const idle = hasIdle
      ? window.requestIdleCallback(start, { timeout: 2000 })
      : window.setTimeout(start, 200)

    return () => {
      cancelled = true
      if (hasIdle) window.cancelIdleCallback(idle)
      else window.clearTimeout(idle)
      attached?.detach()
    }
  }, [size, reducedMotion, warm])

  const webgl = mode === 'webgl'
  return (
    <div
      className={styles.host ?? ''}
      data-globe-mode={mode}
      role={webgl ? 'group' : undefined}
      aria-label={webgl ? 'Orthographic globe — Earth, ISS position, EONET events' : undefined}
      style={{ width: size, height: size }}
    >
      <div
        className={styles.svg ?? ''}
        data-hidden={webgl ? 'true' : undefined}
        aria-hidden={webgl ? true : undefined}
      >
        <Globe {...props} />
      </div>
      <div ref={slot} className={styles.webgl ?? ''} data-visible={webgl ? 'true' : undefined} />
    </div>
  )
}
