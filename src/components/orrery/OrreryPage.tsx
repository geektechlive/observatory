import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useReducedMotion } from '@/hooks/useReducedMotion'
import { heliocentric, jdFromDate, type PlanetName, PLANETS, rangeRateKmS } from '@/lib/orrery'
import type { BodyName } from '@/lib/orrery/bodies'
import { voiceFor, type VoiceInput } from '@/lib/voice'
import { simTimeAt, useOrreryClock } from '@/store/orreryClock'

import consoleStyles from '../consoles/console.module.css'
import { ControlRail } from './ControlRail'
import { Inspector } from './Inspector'
import { labelOrder, layoutLabels } from './labelLayout'
import styles from './orrery.module.css'
import type {
  FocusPreset,
  OrreryRenderer,
  ProjectedBody,
  ScaleMode,
  Visibility,
} from './three/OrreryRenderer'
import { TimeBar } from './TimeBar'
import { useSimTime } from './useSimTime'

/**
 * One renderer for the page's lifetime (the GlobeHost pattern, #46): leaving the tab
 * detaches its canvas, coming back re-attaches it. Rebuilding a WebGL context per visit
 * would churn GPU memory. Null after a context loss, so nothing retries in a loop.
 */
let shared: Promise<OrreryRenderer> | null = null
let lost = false

/** The renderer reads the clock each frame through this, rather than importing the store. */
const CLOCK_READER = {
  simTime: () => simTimeAt(useOrreryClock.getState(), Date.now()),
  motion: () => {
    const { playing, rate } = useOrreryClock.getState()
    return { playing, rate }
  },
}

function acquire(width: number, height: number, reducedMotion: boolean, onLost: () => void) {
  if (!shared) {
    shared = import('./three/OrreryRenderer').then(
      ({ OrreryRenderer }) =>
        new OrreryRenderer({
          width,
          height,
          reducedMotion,
          onContextLost: onLost,
          clock: CLOCK_READER,
        }),
    )
  }
  return shared
}

/** A pointer that moves further than this between down and up was a drag, not a tap. */
const DRAG_PX = 5
const PAGE_REFRESH_MS = 1000
const LOADING = { state: 'loading' } as const
const VOICE_EMPTY: VoiceInput = {
  quakes: LOADING,
  kp: LOADING,
  xray: LOADING,
  wind: LOADING,
  moon: LOADING,
  neo: LOADING,
  people: LOADING,
  launch: LOADING,
  nearest: LOADING,
}

/** The planet nearest Earth at a moment, for the voice line. */
function nearestPlanet(simMs: number) {
  const jd = jdFromDate(new Date(simMs))
  const earth = heliocentric('Earth', jd)
  let best: { name: PlanetName; au: number } | null = null
  for (const p of PLANETS) {
    if (p === 'Earth') continue
    const pos = heliocentric(p, jd)
    const au = Math.hypot(pos.x - earth.x, pos.y - earth.y, pos.z - earth.z)
    if (!best || au < best.au) best = { name: p, au }
  }
  if (!best) return null
  const name = best.name
  return {
    name,
    au: best.au,
    rateKmS: rangeRateKmS(
      (t) => heliocentric(name, t),
      (t) => heliocentric('Earth', t),
      jd,
    ),
    model: !earth.outOfRange,
  }
}

/**
 * The full-page orrery (#91): the Sun and planets in 3D from JPL's approximate
 * elements, a simulation clock, search, focus presets, scale modes and an inspector.
 * Lazy-loaded, so none of this is in the first load.
 */
export function OrreryPage() {
  const root = useRef<HTMLDivElement>(null)
  // Renders so far, on the page root: the soak test checks camera drags cause none (#91).
  useEffect(() => {
    const el = root.current
    if (el) el.dataset['orreryRenders'] = String(Number(el.dataset['orreryRenders'] ?? 0) + 1)
  })
  const host = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const labelNodes = useRef(new Map<BodyName, HTMLButtonElement>())
  const reducedMotion = useReducedMotion()
  const [renderer, setRenderer] = useState<OrreryRenderer | null>(null)
  const [failed, setFailed] = useState(lost)
  const [selected, setSelected] = useState<BodyName | null>(null)
  const [scale, setScale] = useState<ScaleMode>('exaggerated')
  const [preset, setPreset] = useState<FocusPreset | null>('inner')
  const [visibility, setVisibility] = useState<Visibility>({
    planets: true,
    orbits: true,
    labels: true,
  })
  const [sheetOpen, setSheetOpen] = useState(false)
  // The voice line and inspector change slowly: once a second is plenty, and keeps the
  // whole page from re-rendering at the time bar's 4 Hz (it has its own readout).
  const { sim } = useSimTime(PAGE_REFRESH_MS)
  const nearest = useMemo(() => nearestPlanet(sim), [sim])
  const subject = nearest?.name ?? null
  // The label pass runs per drawn frame, outside React: it reads these through refs.
  const selectedRef = useRef<BodyName | null>(null)
  const subjectRef = useRef<BodyName | null>(null)
  useEffect(() => {
    selectedRef.current = selected
    subjectRef.current = subject
    renderer?.invalidate()
  }, [selected, subject, renderer])
  const inspectorRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (lost) return
    let cancelled = false
    let attached: OrreryRenderer | null = null
    const el = host.current
    if (!el) return
    acquire(el.clientWidth || 800, el.clientHeight || 600, reducedMotion, () => {
      lost = true
      shared = null
      setFailed(true)
    })
      .then((r) => {
        if (cancelled || !host.current) return
        r.resize(host.current.clientWidth, host.current.clientHeight)
        r.attach(host.current)
        attached = r
        setRenderer(r)
      })
      .catch((error: unknown) => {
        console.warn('[orrery] WebGL unavailable:', error)
        lost = true
        shared = null
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      attached?.detach()
    }
  }, [reducedMotion])

  // Follow the stage's size.
  useEffect(() => {
    const el = host.current
    if (!renderer || !el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      renderer.resize(el.clientWidth, el.clientHeight)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
    }
  }, [renderer])

  // Labels: positioned from the renderer's own projection each drawn frame, through refs.
  useEffect(() => {
    if (!renderer) return
    renderer.setOnFrame((items: readonly ProjectedBody[]) => {
      const subjectNow = subjectRef.current
      const ordered = labelOrder(items, selectedRef.current, subjectNow)
      const shown = layoutLabels(
        ordered.map((i) => ({
          key: i.name,
          text: i.name,
          x: i.x + i.radiusPx,
          y: i.y,
          visible: i.visible,
          mustShow: i.name === subjectNow,
        })),
      )
      for (const item of items) {
        const node = labelNodes.current.get(item.name)
        if (!node) continue
        const place = shown.get(item.name)
        node.style.left = `${String(item.x + item.radiusPx)}px`
        node.style.top = `${String(item.y + (place?.dy ?? 0))}px`
        // A stacked label carries a short rule back to its body (see .label[data-stacked]).
        node.dataset['stacked'] = place && place.dy !== 0 ? String(Math.sign(place.dy)) : ''
        node.style.setProperty('--leader', `${String(Math.abs(place?.dy ?? 0))}px`)
        node.hidden = !place
      }
      for (const [name, node] of labelNodes.current) {
        if (!items.some((i) => i.name === name)) node.hidden = true
      }
    })
    return () => {
      renderer.setOnFrame(null)
    }
  }, [renderer])

  useEffect(() => {
    renderer?.setVisibility(visibility)
  }, [renderer, visibility])

  // A scrub or a rate change while paused must still redraw.
  useEffect(() => {
    if (!renderer) return
    return useOrreryClock.subscribe(() => {
      renderer.invalidate()
    })
  }, [renderer])

  useEffect(() => {
    renderer?.setScaleMode(scale)
  }, [renderer, scale])

  const select = useCallback(
    (name: BodyName) => {
      setSelected(name)
      setPreset(null)
      setSheetOpen(false)
      renderer?.focusOn(name)
    },
    [renderer],
  )

  // Tap or click a body on the canvas to select it. A drag (the camera turning) is not a
  // pick. Keyboard users have the label buttons and the search box.
  useEffect(() => {
    const el = host.current
    if (!renderer || !el) return
    let down: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY }
    }
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_PX) return
      const box = el.getBoundingClientRect()
      const hit = renderer.pick(e.clientX - box.left, e.clientY - box.top)
      if (hit) select(hit)
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
    }
  }, [renderer, select])

  const onPreset = (p: FocusPreset) => {
    setPreset(p)
    // On a phone the sheet covers the stage; close it so the new view can be seen.
    setSheetOpen(false)
    renderer?.applyPreset(p)
  }

  // With the inspector open over the stage, centre the focus in the part it leaves free:
  // a drawer on the right on wide screens, a sheet along the bottom on phones.
  useEffect(() => {
    if (!renderer) return
    const panel = inspectorRef.current
    const box = stage.current
    if (!selected || !panel || !box) {
      renderer.setViewInset(0, 0)
      return
    }
    const measure = () => {
      const s = box.getBoundingClientRect()
      const p = panel.getBoundingClientRect()
      const sheet = p.width > s.width * 0.6
      renderer.setViewInset(sheet ? 0 : s.right - p.left, sheet ? s.bottom - p.top : 0)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(panel)
    observer.observe(box)
    return () => {
      observer.disconnect()
    }
  }, [renderer, selected])

  const voice = voiceFor('orrery', {
    ...VOICE_EMPTY,
    nearest: nearest ? { state: 'ok', data: nearest } : { state: 'error' },
  })
  const outOfRange = heliocentric('Earth', jdFromDate(new Date(sim)))

  return (
    <div ref={root} className={styles.page ?? ''} data-orrery-page="">
      <div className={styles.voiceStrip ?? ''}>
        <p className={consoleStyles.voice ?? ''}>{voice}</p>
        <p className={consoleStyles.sub ?? ''}>
          Solar system in 3D · JPL approximate elements · drag to turn, pinch or scroll to zoom
        </p>
      </div>

      <ControlRail
        open={sheetOpen}
        visibility={visibility}
        onVisibility={setVisibility}
        scale={scale}
        onScale={setScale}
        preset={preset}
        onPreset={onPreset}
        onSelect={select}
      />

      <section ref={stage} className={styles.stage ?? ''} aria-label="Orrery">
        <div
          ref={host}
          className={styles.canvasHost ?? ''}
          data-orrery-mode={failed ? 'unavailable' : renderer ? 'webgl' : 'loading'}
        />
        <div className={styles.labels ?? ''} aria-label="Bodies" role="group">
          {(['Sun', ...PLANETS] as BodyName[]).map((name) => (
            <button
              key={name}
              type="button"
              hidden
              ref={(el) => {
                if (el) labelNodes.current.set(name, el)
                else labelNodes.current.delete(name)
              }}
              className={styles.label ?? ''}
              aria-pressed={selected === name}
              onClick={() => {
                select(name)
              }}
            >
              {name}
            </button>
          ))}
        </div>
        {scale !== 'proportional' && <p className={styles.badge ?? ''}>NOT TO SCALE</p>}
        {failed && (
          <p className={styles.notice ?? ''} role="status">
            The 3D view needs WebGL, which this browser could not start. Reload to try again.
          </p>
        )}
        {!failed && (outOfRange.outOfRange || outOfRange.table === 2) && (
          <p className={styles.notice ?? ''} role="status">
            {outOfRange.outOfRange
              ? 'Outside 3000 BC – 3000 AD: no JPL table is valid, so positions are rough.'
              : 'Outside 1800–2050: using JPL’s long-window table (Table 2), a little less precise.'}
          </p>
        )}
        <button
          type="button"
          className={`${styles.chipBtn ?? ''} ${styles.sheetToggle ?? ''}`}
          aria-expanded={sheetOpen}
          aria-controls="orrery-controls"
          onClick={() => {
            setSheetOpen((o) => !o)
          }}
        >
          {sheetOpen ? 'Close controls' : 'Controls'}
        </button>
        {selected && (
          <Inspector
            ref={inspectorRef}
            body={selected}
            simMs={sim}
            onClose={() => {
              setSelected(null)
            }}
          />
        )}
        <TimeBar />
      </section>
    </div>
  )
}
