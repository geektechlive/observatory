import { type ComponentProps, useCallback, useEffect, useRef, useState } from 'react'

import { Chip } from '@/components/ui/Chip'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import type { LaneCensus } from '@/lib/census'
import { gpuTier } from '@/lib/globe3d'
import { chooseGlobeMode, type GlobeMode, readGlobeModeInput, readGpuInfo } from '@/lib/globeMode'

import { Globe } from './Globe'
import styles from './globe-host.module.css'
import { GlobeA11yOverlay } from './GlobeA11yOverlay'
import { BEZEL_WIDTH, GlobeBezel, type GlobeBezelHandle } from './GlobeBezel'
import type { GlobeRenderer } from './three/GlobeRenderer'

type GlobeProps = ComponentProps<typeof Globe> & {
  /** Live lane census for the bezel (#51); the bezel is drawn only when it is given. */
  census?: readonly LaneCensus[] | undefined
}

const NONE: readonly never[] = []
/** Matches the SVG globe's default when the ISS feed has no altitude yet. */
const DEFAULT_ISS_ALT_KM = 420

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
 * a lazy upgrade that crossfades in on its first frame (#46). See src/lib/globeMode.ts
 * for when it falls back (no WebGL, save-data, ?globe=svg).
 * `data-globe-mode` says which one is live, so e2e can't pass silently on the fallback.
 */
export function GlobeHost({ census, ...props }: GlobeProps) {
  const [mode, setMode] = useState<GlobeMode>('svg')
  const [renderer, setRenderer] = useState<GlobeRenderer | null>(null)
  const slot = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  const size = props.size ?? 460
  const warm = props.warm ?? true
  // Read at creation only; later changes go through setWarm so the renderer isn't rebuilt.
  const initialWarm = useRef(warm)

  // Feed the live renderer whenever the globe's data or modes change (#49).
  const {
    issLat,
    issLon,
    issAlt,
    trail,
    events,
    quakes,
    fires,
    fireballs,
    launches,
    disasters,
    satellites,
    aurora,
  } = props
  const tracking = props.tracking ?? false
  const showTerminator = props.showTerminator ?? true
  useEffect(() => {
    if (!renderer) return
    renderer.setLayers({
      iss:
        issLat !== undefined && issLon !== undefined
          ? { lat: issLat, lon: issLon, alt: issAlt ?? DEFAULT_ISS_ALT_KM }
          : null,
      trail: trail ?? NONE,
      events: events ?? NONE,
      quakes: quakes ?? NONE,
      fires: fires ?? NONE,
      fireballs: fireballs ?? NONE,
      launches: launches ?? NONE,
      disasters: disasters ?? NONE,
      satellites: satellites ?? NONE,
      aurora: aurora ?? NONE,
      tracking,
    })
  }, [
    renderer,
    issLat,
    issLon,
    issAlt,
    trail,
    events,
    quakes,
    fires,
    fireballs,
    launches,
    disasters,
    satellites,
    aurora,
    tracking,
  ])

  useEffect(() => {
    renderer?.setWarm(warm)
    renderer?.setShowTerminator(showTerminator)
  }, [renderer, warm, showTerminator])

  // Rotation holds still while a marker has focus or the pointer is over the globe,
  // so a target never moves out from under the person aiming at it.
  const [focusWithin, setFocusWithin] = useState(false)
  const [hovering, setHovering] = useState(false)
  // WCAG 2.2.2: anything that moves for more than 5 s gets a visible way to stop it.
  const [userPaused, setUserPaused] = useState(false)
  const autoRotate = (props.autoRotate ?? true) && !userPaused
  useEffect(() => {
    renderer?.setRotationPaused(!autoRotate || focusWithin || hovering)
  }, [renderer, autoRotate, focusWithin, hovering])

  // The bezel's bearing scale follows whichever globe is live.
  const bezel = useRef<GlobeBezelHandle>(null)
  const onFacingChange = useCallback((lon: number) => {
    bezel.current?.setFacing(lon)
  }, [])
  useEffect(() => {
    renderer?.setOnRotate(onFacingChange)
    return () => renderer?.setOnRotate(null)
  }, [renderer, onFacingChange])

  useEffect(() => {
    if (failed || chooseGlobeMode(readGlobeModeInput()) !== 'webgl') return
    let cancelled = false
    let attached: GlobeRenderer | null = null

    const fallBack = (reason: unknown) => {
      console.warn('[globe] staying on the SVG globe:', reason)
      releaseAfterFailure()
      if (!cancelled) {
        setRenderer(null)
        setMode('svg')
      }
    }

    const start = () => {
      acquireRenderer(size, reducedMotion, initialWarm.current, () => {
        fallBack('WebGL context lost')
      })
        .then((created) => {
          if (cancelled || !slot.current) return
          created.attach(slot.current)
          attached = created
          setRenderer(created)
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
  }, [size, reducedMotion])

  const webgl = mode === 'webgl'
  const box = size + 2 * BEZEL_WIDTH
  return (
    <div className={styles.instrument ?? ''} style={{ width: box }}>
      <div
        className={styles.host ?? ''}
        data-globe-mode={mode}
        role={webgl ? 'group' : undefined}
        aria-label={webgl ? 'Orthographic globe — Earth, ISS position, EONET events' : undefined}
        onPointerEnter={() => {
          setHovering(true)
        }}
        onPointerLeave={() => {
          setHovering(false)
        }}
      >
        {census && <GlobeBezel ref={bezel} size={size} census={census} />}
        <div
          className={styles.lens ?? ''}
          style={{ inset: `${String((BEZEL_WIDTH / box) * 100)}%` }}
        >
          <div
            className={styles.svg ?? ''}
            data-hidden={webgl ? 'true' : undefined}
            aria-hidden={webgl ? true : undefined}
          >
            <Globe
              {...props}
              autoRotate={autoRotate}
              onFacingChange={webgl ? undefined : onFacingChange}
            />
          </div>
          <div
            ref={slot}
            className={styles.webgl ?? ''}
            data-visible={webgl ? 'true' : undefined}
          />
          {webgl && renderer && (
            <GlobeA11yOverlay
              renderer={renderer}
              size={size}
              events={events ?? NONE}
              quakes={quakes ?? NONE}
              onFocusChange={setFocusWithin}
            />
          )}
        </div>
      </div>
      <div className={styles.controls ?? ''}>
        <Chip
          pressed={userPaused}
          onClick={() => {
            setUserPaused((p) => !p)
          }}
        >
          {userPaused ? 'Resume rotation' : 'Pause rotation'}
        </Chip>
      </div>
    </div>
  )
}
