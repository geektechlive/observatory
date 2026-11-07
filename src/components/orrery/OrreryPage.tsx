import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useDsn } from '@/hooks/useDsn'
import { useOrreryBodies } from '@/hooks/useOrreryBodies'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { dsnContactsById } from '@/lib/dsn'
import {
  heliocentric,
  HELIOPAUSE_LABEL,
  jdFromDate,
  type PlanetName,
  PLANETS,
  rangeRateKmS,
} from '@/lib/orrery'
import { moonBodies } from '@/lib/orrery/moonState'
import { voiceFor, type VoiceInput } from '@/lib/voice'
import type { OrreryMoon, OrreryTrack } from '@/schemas/orreryBodies'
import { simTimeAt, useOrreryClock } from '@/store/orreryClock'

import consoleStyles from '../consoles/console.module.css'
import { buildCatalog, noDataNotice } from './catalog'
import { ControlRail } from './ControlRail'
import { type CraftFilter, DEFAULT_CRAFT_FILTER } from './craftFilter'
import { DEFAULT_PRESET } from './defaultView'
import { Inspector } from './Inspector'
import { labelOrder, layoutLabels, rimPoint, spreadRim } from './labelLayout'
import styles from './orrery.module.css'
import type {
  FocusPreset,
  OrreryRenderer,
  ProjectedBody,
  ScaleMode,
  SceneKey,
  SunImageState,
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
/** Rim markers sit this far in from the stage edge, px. */
const RIM_INSET = 14
/** Below this stage width the heliopause ring keeps its line but drops its label, px. */
const RING_LABEL_MIN_WIDTH = 600
const LOADING = { state: 'loading' } as const
const NO_TRACKS: readonly OrreryTrack[] = []
const NO_MOONS: readonly OrreryMoon[] = []
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

/** The craft list's status line in the controls: count and age, or why there are none. */
function craftStatusText(
  status: 'pending' | 'error' | 'success',
  count: number,
  ageSeconds: number | null,
  degraded: boolean,
): string {
  if (status === 'pending') return 'Loading spacecraft from JPL Horizons…'
  if (status === 'error') return 'Spacecraft positions are unavailable right now.'
  const age =
    ageSeconds === null
      ? ''
      : `, sampled ${String(Math.max(1, Math.round(ageSeconds / 3600)))} h ago`
  return `${String(count)} spacecraft from JPL Horizons${age}${degraded ? ' (older than usual)' : ''}.`
}

/**
 * The full-page orrery (#91, #93): the Sun and planets from JPL's approximate elements,
 * spacecraft from JPL Horizons samples, a simulation clock, search, focus presets, scale
 * modes and an inspector. Lazy-loaded, so none of this is in the first load.
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
  const labelNodes = useRef(new Map<SceneKey, HTMLButtonElement>())
  const ringNodes = useRef(new Map<SceneKey, HTMLSpanElement>())
  const ringLabel = useRef<HTMLSpanElement>(null)
  const reducedMotion = useReducedMotion()
  const [renderer, setRenderer] = useState<OrreryRenderer | null>(null)
  const [failed, setFailed] = useState(lost)
  const [selected, setSelected] = useState<SceneKey | null>(null)
  const [scale, setScale] = useState<ScaleMode>('exaggerated')
  const [preset, setPreset] = useState<FocusPreset | null>(DEFAULT_PRESET)
  const [visibility, setVisibility] = useState<Visibility>({
    planets: true,
    orbits: true,
    labels: true,
  })
  const [craftFilter, setCraftFilter] = useState<CraftFilter>(DEFAULT_CRAFT_FILTER)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sun, setSun] = useState<SunImageState | undefined>(undefined)
  // The voice line and inspector change slowly: once a second is plenty, and keeps the
  // whole page from re-rendering at the time bar's 4 Hz (it has its own readout).
  const { sim } = useSimTime(PAGE_REFRESH_MS)
  const nearest = useMemo(() => nearestPlanet(sim), [sim])
  const subject = nearest?.name ?? null

  // Craft, Earth and Moon from JPL Horizons (#93), and who DSN is talking to now.
  const bodies = useOrreryBodies()
  const tracks = bodies.data?.bodies ?? NO_TRACKS
  const craftTracks = useMemo(
    () => tracks.filter((t) => t.category === 'spacecraft' || t.category === 'space_telescope'),
    [tracks],
  )
  // Moons (#107): the payload's planet-centred ones and Earth's Moon from Moon minus Earth.
  const payloadMoons = bodies.data?.moons ?? NO_MOONS
  const moons = useMemo(() => moonBodies(payloadMoons, tracks), [payloadMoons, tracks])
  const moonParent = useMemo(() => new Map(moons.map((m) => [m.key, m.parent])), [moons])
  const dsnQuery = useDsn()
  const dsn = useMemo(() => dsnContactsById(dsnQuery.data), [dsnQuery.data])
  const dsnIds = useMemo(() => new Set(dsn.keys()), [dsn])
  const dsnRef = useRef(dsnIds)
  const jdNow = jdFromDate(new Date(sim))
  // Whole days are enough for "no data for this date" in the search list.
  const catalogDay = Math.floor(jdNow)
  const catalog = useMemo(
    () => buildCatalog(tracks, catalogDay + 0.5, moons),
    [tracks, catalogDay, moons],
  )

  // The label pass runs per drawn frame, outside React: it reads these through refs.
  const selectedRef = useRef<SceneKey | null>(null)
  const subjectRef = useRef<SceneKey | null>(null)
  useEffect(() => {
    selectedRef.current = selected
    subjectRef.current = subject
    dsnRef.current = dsnIds
    renderer?.invalidate()
  }, [selected, subject, dsnIds, renderer])
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

  // The time bar covers the stage's bottom strip: presets keep craft above it (#93).
  useEffect(() => {
    const el = host.current
    const bar = stage.current?.querySelector<HTMLElement>('[aria-label="Simulation time"]')
    if (!renderer || !el || !bar || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      renderer.setFrameReserve(
        Math.max(0, el.getBoundingClientRect().bottom - bar.getBoundingClientRect().top),
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    observer.observe(bar)
    return () => {
      observer.disconnect()
    }
  }, [renderer])

  useEffect(() => {
    renderer?.setTracks(tracks)
  }, [renderer, tracks])

  useEffect(() => {
    renderer?.setMoons(moons)
  }, [renderer, moons])

  // The live Sun's frame and time, for the inspector (#105).
  useEffect(() => {
    if (!renderer) return
    renderer.setOnSunImage(setSun)
    return () => {
      renderer.setOnSunImage(null)
    }
  }, [renderer])

  useEffect(() => {
    renderer?.setCraftFilter(craftFilter)
  }, [renderer, craftFilter])

  useEffect(() => {
    renderer?.setDsnIds(dsnIds)
  }, [renderer, dsnIds])

  useEffect(() => {
    renderer?.setTrajectory(selected)
  }, [renderer, selected, tracks])

  // Labels: positioned from the renderer's own projection each drawn frame, through refs.
  useEffect(() => {
    if (!renderer) return
    renderer.setOnFrame((projected: readonly ProjectedBody[]) => {
      // The heliopause ring's label is furniture, placed on its own; the rest are bodies.
      const ring = projected.find((i) => i.kind === 'ring')
      const ringNode = ringLabel.current
      if (ringNode) {
        // On a phone-width stage the label would run across the planets: the ring stays,
        // its label goes.
        ringNode.hidden = !ring || (host.current?.clientWidth ?? 0) < RING_LABEL_MIN_WIDTH
        if (ring) {
          ringNode.style.left = `${String(ring.x)}px`
          ringNode.style.top = `${String(ring.y)}px`
        }
      }
      const items = projected.filter((i) => i.kind !== 'ring')
      const subjectNow = subjectRef.current
      const box = host.current
      const width = box?.clientWidth ?? 0
      const height = box?.clientHeight ?? 0
      // Rim markers keep clear of the time bar along the stage's bottom edge.
      const bar = stage.current?.querySelector<HTMLElement>('[aria-label="Simulation time"]')
      const bottomInset = bar ? height - bar.offsetTop + RIM_INSET : RIM_INSET
      // What sits under the time bar is out of view too, even inside the canvas.
      const inView = (i: ProjectedBody) => i.visible && i.y < height - bottomInset + RIM_INSET
      // Deep-space craft beyond the view become rim markers with their true distance,
      // slid apart along the rim when two would overlap.
      const rim = items.filter((i) => i.kind === 'craft' && !inView(i) && i.group === 'deep-space')
      const rimEdges = new Map(
        rim.map((i) => [
          i.name,
          rimPoint(i.x, i.y, i.behind, width, height, RIM_INSET, bottomInset),
        ]),
      )
      const rimPlaces = spreadRim(
        rim.map((i) => {
          const p = rimEdges.get(i.name) ?? { x: 0, y: 0, edge: 'top' as const }
          return {
            key: i.name,
            text: `${i.label} · ${(i.sunAu ?? 0).toFixed(0)} au`,
            x: p.x,
            y: p.y,
            alongX: p.edge === 'top' || p.edge === 'bottom',
          }
        }),
        { left: RIM_INSET, right: width - RIM_INSET },
      )
      // Craft DSN is talking to, and the deep-space ones, win label room after the voice
      // subject: on a phone Voyager 1's label used to lose to Juno's.
      const boosted = new Set(
        items
          .filter(
            (i) =>
              i.kind === 'craft' &&
              (i.group === 'deep-space' ||
                (i.naifId !== undefined && dsnRef.current.has(i.naifId))),
          )
          .map((i) => i.name),
      )
      const ordered = labelOrder(items, selectedRef.current, subjectNow, boosted)
      // Planets' drawn discs: craft and moon labels keep off them (#107: Juno on Jupiter).
      const discs = items
        .filter((i) => i.kind === 'body' && i.visible)
        .map((i) => ({ x: i.x, y: i.y, r: i.radiusPx }))
      const shown = layoutLabels(
        ordered.map((i) => ({
          key: i.name,
          text: i.label,
          x: i.x + i.radiusPx,
          y: i.y,
          visible: inView(i),
          mustShow: i.name === subjectNow,
          avoidDiscs: i.kind === 'craft' || i.kind === 'moon',
        })),
        discs,
      )
      const seen = new Set<SceneKey>()
      for (const item of items) {
        seen.add(item.name)
        const node = labelNodes.current.get(item.name)
        const ring = ringNodes.current.get(item.name)
        if (ring) {
          ring.hidden = !item.visible || !(item.naifId && dsnRef.current.has(item.naifId))
          ring.style.left = `${String(item.x)}px`
          ring.style.top = `${String(item.y)}px`
        }
        if (!node) continue
        const distance = node.querySelector<HTMLElement>('[data-rim-distance]')
        const edge = rimEdges.get(item.name)
        const p = rimPlaces.get(item.name)
        if (edge && p) {
          node.style.left = `${String(p.x)}px`
          node.style.top = `${String(p.y)}px`
          node.dataset['rim'] = edge.edge
          node.dataset['stacked'] = ''
          if (distance) distance.textContent = ` · ${(item.sunAu ?? 0).toFixed(0)} au`
          node.hidden = false
          continue
        }
        node.dataset['rim'] = ''
        if (distance) distance.textContent = ''
        const place = shown.get(item.name)
        node.style.left = `${String(item.x + item.radiusPx + (place?.dx ?? 0))}px`
        node.style.top = `${String(item.y + (place?.dy ?? 0))}px`
        // A stacked label carries a short rule back to its body (see .label[data-stacked]).
        node.dataset['stacked'] = place && place.dy !== 0 ? String(Math.sign(place.dy)) : ''
        node.style.setProperty('--leader', `${String(Math.abs(place?.dy ?? 0))}px`)
        node.hidden = !place
      }
      for (const [name, node] of labelNodes.current) {
        if (!seen.has(name)) node.hidden = true
      }
      for (const [name, ring] of ringNodes.current) {
        if (!seen.has(name)) ring.hidden = true
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
    (key: SceneKey) => {
      setSelected(key)
      setPreset(null)
      setSheetOpen(false)
      // A moon moves fast around its planet: the camera holds the planet's neighbourhood,
      // where the moon is drawn (#107).
      renderer?.focusOn(moonParent.get(key) ?? key)
    },
    [renderer, moonParent],
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
  const outOfRange = heliocentric('Earth', jdNow)
  // Craft and moons outside their data spans hide; the stage says so (#114).
  const noData = bodies.status === 'success' ? noDataNotice(catalog) : null
  const craftStatus = craftStatusText(
    bodies.status,
    craftTracks.length,
    bodies.dataAgeSeconds,
    bodies.degraded,
  )

  return (
    <div ref={root} className={styles.page ?? ''} data-orrery-page="">
      <div className={styles.voiceStrip ?? ''}>
        <p className={consoleStyles.voice ?? ''}>{voice}</p>
        <p className={consoleStyles.sub ?? ''}>
          Solar system in 3D · planets from JPL approximate elements, spacecraft from JPL Horizons ·
          drag to turn, pinch or scroll to zoom
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
        items={catalog}
        craftFilter={craftFilter}
        onCraftFilter={setCraftFilter}
        craftStatus={craftStatus}
        dsnCount={craftTracks.filter((t) => dsnIds.has(t.naifId)).length}
      />

      <section ref={stage} className={styles.stage ?? ''} aria-label="Orrery">
        <div
          ref={host}
          className={styles.canvasHost ?? ''}
          data-orrery-mode={failed ? 'unavailable' : renderer ? 'webgl' : 'loading'}
        />
        <div className={styles.labels ?? ''} aria-label="Bodies" role="group">
          <span
            ref={ringLabel}
            hidden
            className={styles.ringLabel ?? ''}
            title="Approximate: the heliopause is neither a sphere nor fixed. NASA/JPL date Voyager 1's crossing to Aug. 25, 2012; JPL Horizons puts it 121.6 au from the Sun that day."
          >
            {HELIOPAUSE_LABEL}
          </span>
          {craftTracks.map((t) => (
            <span
              key={`ring-${t.id}`}
              hidden
              aria-hidden="true"
              className={styles.dsnRing ?? ''}
              ref={(el) => {
                if (el) ringNodes.current.set(t.id, el)
                else ringNodes.current.delete(t.id)
              }}
            />
          ))}
          {(['Sun', ...PLANETS] as string[]).map((name) => (
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
          {craftTracks.map((t) => (
            <button
              key={t.id}
              type="button"
              hidden
              data-kind="craft"
              data-dsn={dsnIds.has(t.naifId) ? 'contact' : undefined}
              ref={(el) => {
                if (el) labelNodes.current.set(t.id, el)
                else labelNodes.current.delete(t.id)
              }}
              className={`${styles.label ?? ''} ${styles.craftLabel ?? ''}`}
              aria-pressed={selected === t.id}
              onClick={() => {
                select(t.id)
              }}
            >
              {t.name}
              <span data-rim-distance="" />
            </button>
          ))}
          {moons.map((m) => (
            <button
              key={m.key}
              type="button"
              hidden
              data-kind="moon"
              ref={(el) => {
                if (el) labelNodes.current.set(m.key, el)
                else labelNodes.current.delete(m.key)
              }}
              className={`${styles.label ?? ''} ${styles.moonLabel ?? ''}`}
              aria-pressed={selected === m.key}
              onClick={() => {
                select(m.key)
              }}
            >
              {m.name}
            </button>
          ))}
        </div>
        {scale !== 'proportional' && <p className={styles.badge ?? ''}>NOT TO SCALE</p>}
        <div className={styles.notices ?? ''}>
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
          {!failed && noData && (
            <p className={styles.notice ?? ''} role="status" data-orrery-nodata="">
              {noData}
            </p>
          )}
        </div>
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
            tracks={tracks}
            dsn={dsn}
            sun={sun}
            moons={moons}
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
