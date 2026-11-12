import {
  type CSSProperties,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useDsn } from '@/hooks/useDsn'
import { useNow } from '@/hooks/useNow'
import { useOrreryBodies } from '@/hooks/useOrreryBodies'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useDiscos, useSatcatEntry } from '@/hooks/useSatelliteFacts'
import { useSpaceTrack } from '@/hooks/useSpaceTrack'
import { fetchOrrerySatsBody } from '@/lib/api/orrerySats'
import { dsnContactsById } from '@/lib/dsn'
import { loadSatWorker } from '@/lib/orbit/bulk/loadSatWorker'
import {
  heliocentric,
  HELIOPAUSE_LABEL,
  jdFromDate,
  type PlanetName,
  PLANETS,
  rangeRateKmS,
} from '@/lib/orrery'
import { dwarfNotice, type OrreryEntryGroup } from '@/lib/orrery/dwarfView'
import { isLookupKey } from '@/lib/orrery/lookupTrack'
import { modelForKey } from '@/lib/orrery/modelDescriptor'
import { moonBodies } from '@/lib/orrery/moonState'
import { isSatKey } from '@/lib/orrery/satView'
import { reentriesWithin } from '@/lib/spaceTrackText'
import { voiceFor, type VoiceInput } from '@/lib/voice'
import type { OrreryMoon, OrreryTrack } from '@/schemas/orreryBodies'
import { simTimeAt, useOrreryClock } from '@/store/orreryClock'
import { useOrreryView } from '@/store/orreryView'

import consoleStyles from '../consoles/console.module.css'
import { buildCatalog, L1_KEY, noDataNotice } from './catalog'
import { ControlRail } from './ControlRail'
import { type CraftFilter, DEFAULT_CRAFT_FILTER } from './craftFilter'
import { DetailLoading } from './DetailLoading'
import { DETAIL_VIEW_ID } from './detailViewId'
import { DwarfControls } from './DwarfControls'
import { GuideChip } from './GuideChip'
import { Inspector } from './Inspector'
import {
  asteroidLabelKeys,
  bodyLabelReach,
  farBeyondFocus,
  LABEL_CHAR_PX,
  labelOrder,
  type LabelPlacement,
  layoutStage,
  panelInset,
  rimPoint,
} from './labelLayout'
import { useLookupStore } from './lookupStore'
import { NeoControls } from './NeoControls'
import styles from './orrery.module.css'
import { SatControls } from './SatControls'
import {
  ALL_SAT_TOGGLES_ON,
  DEFAULT_SAT_TOGGLES,
  enabledSatGroups,
  satHiddenNotice,
  satStatusText,
  type SatToggles,
  toggleForGroup,
  withToggleOn,
} from './satToggles'
import { SmallBodyControls } from './SmallBodyControls'
import type { DetailStats } from './three/DetailScene'
import type {
  FocusPreset,
  OrreryRenderer,
  ProjectedBody,
  SatViewState,
  SceneKey,
  SunImageState,
  Visibility,
} from './three/OrreryRenderer'
import { TimeBar } from './TimeBar'
import { useDetailViewModule } from './useDetailViewModule'
import { useGuide } from './useGuide'
import { useLookupTrack } from './useLookupTrack'
import { useNearEarth } from './useNearEarth'
import { useOrreryLink } from './useOrreryLink'
import { useSimTime } from './useSimTime'
import { useSmallBodies } from './useSmallBodies'

/** Clear space kept under a phone's guide bar for the labels of what the lesson shows. */
const GUIDE_BAR_GAP_PX = 28

/** The guide drawer (#159) loads on first open, never with the page. */
const OrreryGuide = lazy(() =>
  import('./guide/OrreryGuide').then((m) => ({ default: m.OrreryGuide })),
)

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

/** The satellites' data (#98): the stored CelesTrak groups and the shared SGP4 worker. */
const SAT_SOURCE = { fetchGroup: fetchOrrerySatsBody, worker: loadSatWorker }

/**
 * The live page's context-loss handler. The renderer outlives the page and was given only
 * the first mount's callback, so a loss after a tab round trip reached a dead page (#190):
 * each mount overwrites this, and the renderer calls through `contextLost`.
 */
let pageOnLost: (() => void) | null = null

function contextLost() {
  lost = true
  shared = null
  pageOnLost?.()
}

function acquire(width: number, height: number, reducedMotion: boolean) {
  if (!shared) {
    shared = import('./three/OrreryRenderer').then(
      ({ OrreryRenderer }) =>
        new OrreryRenderer({
          width,
          height,
          reducedMotion,
          onContextLost: contextLost,
          clock: CLOCK_READER,
          satSource: SAT_SOURCE,
        }),
    )
  }
  return shared
}

/** The view store's setters are stable: the page uses them like state setters. */
const { setSelected, setScale, setPreset, openDetail, closeDetail } = useOrreryView.getState()

/** A pointer that moves further than this between down and up was a drag, not a tap. */
const DRAG_PX = 5
const PAGE_REFRESH_MS = 1000
/** Re-entry predictions are judged against the wall clock, a minute at a time (#101). */
const REENTRY_REFRESH_MS = 60_000
/** Rim markers sit this far in from the stage edge, px. */
const RIM_INSET = 14
/** Below this stage width the heliopause ring keeps its line but drops its label, px. */
const RING_LABEL_MIN_WIDTH = 600
const LOADING = { state: 'loading' } as const
const NO_TRACKS: readonly OrreryTrack[] = []
const NO_MOONS: readonly OrreryMoon[] = []
const NO_GROUP_STATES: SatViewState['groups'] = {}
const NO_NAMES: Readonly<Record<string, string>> = {}
/** Each small-body group's label ink (#99): comets ice blue, visitors violet, dwarfs rose. */
const LABEL_CLASS: Record<OrreryEntryGroup, string | undefined> = {
  comets: styles.cometLabel,
  interstellar: styles.interstellarLabel,
  dwarfs: styles.dwarfLabel,
}
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
  // The view's controls live in a store: they outlive the page like the renderer does (#189).
  const selected = useOrreryView((s) => s.selected)
  const scale = useOrreryView((s) => s.scale)
  const preset = useOrreryView((s) => s.preset)
  const detail = useOrreryView((s) => s.detail)
  const [visibility, setVisibility] = useState<Visibility>({
    planets: true,
    orbits: true,
    labels: true,
  })
  const [craftFilter, setCraftFilter] = useState<CraftFilter>(DEFAULT_CRAFT_FILTER)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sun, setSun] = useState<SunImageState | undefined>(undefined)
  // Satellites (#98): which kinds are switched on, and what the renderer has of them.
  const [satToggles, setSatToggles] = useState<SatToggles>(DEFAULT_SAT_TOGGLES)
  const [satState, setSatState] = useState<SatViewState | null>(null)
  // Space-Track and ESA DISCOS (#101): re-entries, the Box Score, physical facts.
  const { data: spaceTrack } = useSpaceTrack()
  const { data: discos } = useDiscos()
  const wallNow = useNow(REENTRY_REFRESH_MS).getTime()
  const reentries = useMemo(
    () => (spaceTrack?.tip ? reentriesWithin(spaceTrack.tip.reentries, wallNow, 7) : []),
    [spaceTrack, wallNow],
  )
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
  // Close approaches, Scout, the Sun–Earth line and L1 (#92).
  const near = useNearEarth(renderer, jdNow)
  const nearCatalog = near.catalog
  // Whole days are enough for "no data for this date" in the search list.
  const catalogDay = Math.floor(jdNow)
  // The space stations once their group has loaded (a new state each time one does).
  const stations = useMemo(
    () => (renderer && satState ? renderer.satellites('stations') : []),
    [renderer, satState],
  )
  const catalog = useMemo(
    () => buildCatalog(tracks, catalogDay + 0.5, moons, nearCatalog, stations),
    [tracks, catalogDay, moons, nearCatalog, stations],
  )
  // Comets and the interstellar objects (#99): fetched once a switch or a link asks.
  const small = useSmallBodies(renderer, catalogDay + 0.5)
  const showSmallGroupOf = small.showGroupOf

  // The label pass runs per drawn frame, outside React: it reads these through refs.
  const selectedRef = useRef<SceneKey | null>(null)
  const subjectRef = useRef<SceneKey | null>(null)
  // Each close approach's hazard flag and miss distance, to rank its label (#130): built
  // when the approaches change, not every frame.
  const approachRank = useMemo(
    () =>
      new Map(
        near.approaches.map((a) => [
          a.id,
          { key: a.id, pha: a.pha, distAu: a.closeApproach.distAu },
        ]),
      ),
    [near.approaches],
  )
  const approachRankRef = useRef(approachRank)
  useEffect(() => {
    selectedRef.current = selected
    subjectRef.current = subject
    dsnRef.current = dsnIds
    approachRankRef.current = approachRank
    renderer?.invalidate()
  }, [selected, subject, dsnIds, approachRank, renderer])
  const inspectorRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (lost) return
    let cancelled = false
    const el = host.current
    if (!el) return
    const onLost = () => {
      setFailed(true)
    }
    pageOnLost = onLost
    acquire(el.clientWidth || 800, el.clientHeight || 600, reducedMotion)
      .then((r) => {
        if (cancelled || !host.current) return
        r.resize(host.current.clientWidth, host.current.clientHeight)
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
      if (pageOnLost === onLost) pageOnLost = null
    }
  }, [reducedMotion])

  // The detail view (#203) has a canvas of its own, so the orrery steps aside while it is
  // open: detach() stops the loop, the tick and the Sun image and takes the canvas off the
  // page, keeping the scene. This effect is the only owner of attach and detach, so a
  // page that unmounts with the view open leaves nothing attached.
  const detailDescriptor = useMemo(
    () => (detail ? modelForKey(detail, (key) => renderer?.satellite(key) ?? null) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- satState says a group loaded
    [detail, renderer, satState],
  )
  const detailOpen = detail !== null && detailDescriptor !== undefined
  // On a phone the sheet folds to its header row while the view is open and "Facts" opens it
  // (#205). It opens folded each time the view opens: reset when `detailOpen` changes.
  const [factsOpen, setFactsOpen] = useState(false)
  const [factsFor, setFactsFor] = useState(detailOpen)
  if (factsFor !== detailOpen) {
    setFactsFor(detailOpen)
    setFactsOpen(false)
  }
  // The view's chunk loads on first open, never with the page (scripts/check-bundle.mjs).
  // If the fetch fails the view closes, so the orrery re-attaches and is never left detached.

  const DetailViewComponent = useDetailViewModule(detailOpen, closeDetail)
  useEffect(() => {
    const el = host.current
    if (!renderer || !el || detailOpen) return
    renderer.resize(el.clientWidth, el.clientHeight)
    renderer.attach(el)
    return () => {
      renderer.detach()
    }
  }, [renderer, detailOpen])

  const lookCloserRef = useRef<HTMLButtonElement>(null)
  // Closing the view returns focus to the button that opened it (#203).
  // Only after Back to orrery or Escape: a close from a link, a lost context or a new
  // selection must leave focus where the user put it.
  const wasDetailOpen = useRef(false)
  const returnFocus = useRef(false)
  useEffect(() => {
    if (detailOpen) {
      wasDetailOpen.current = true
    } else if (wasDetailOpen.current) {
      wasDetailOpen.current = false
      if (returnFocus.current) lookCloserRef.current?.focus()
      returnFocus.current = false
    }
  }, [detailOpen])
  const backToOrrery = useCallback(() => {
    returnFocus.current = true
    closeDetail()
  }, [])
  // How many detail scenes and models are alive, on the page root, for the leak test.
  const reportDetailStats = useCallback((stats: DetailStats) => {
    const el = root.current
    if (!el) return
    el.dataset['orreryDetailScenes'] = String(stats.scenes)
    el.dataset['orreryDetailModels'] = String(stats.models)
    el.dataset['orreryDetailOpened'] = String(stats.opened)
    el.dataset['orreryDetailLeaked'] = String(stats.leaked)
    el.dataset['orreryDetailLeakedTextures'] = String(stats.leakedTextures)
  }, [])

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
    renderer?.setSatGroups(enabledSatGroups(satToggles))
  }, [renderer, satToggles])

  useEffect(() => {
    renderer?.setReentries(reentries.map((r) => r.noradId))
  }, [renderer, reentries])

  useEffect(() => {
    if (!renderer) return
    renderer.setOnSatState(setSatState)
    return () => {
      renderer.setOnSatState(null)
    }
  }, [renderer])

  useEffect(() => {
    renderer?.setTrajectory(selected)
  }, [renderer, selected, tracks])

  // Labels: positioned from the renderer's own projection each drawn frame, through refs.
  useEffect(() => {
    if (!renderer) return
    // Last frame's placements: a label holds its slot while it is free (#132 review).
    let previous: ReadonlyMap<string, LabelPlacement> | undefined
    renderer.setOnFrame((projected: readonly ProjectedBody[]) => {
      // Every read (sizes, rects, widths) comes before every write, so a frame costs one
      // layout at most: a write between reads forced a synchronous reflow each frame.
      const ring = projected.find((i) => i.kind === 'ring')
      const items = projected.filter((i) => i.kind !== 'ring')
      const subjectNow = subjectRef.current
      const box = host.current
      const width = box?.clientWidth ?? 0
      const height = box?.clientHeight ?? 0
      // Rim markers keep clear of the time bar along the stage's bottom edge.
      const bar = stage.current?.querySelector<HTMLElement>('[aria-label="Simulation time"]')
      const bottomInset = bar ? height - bar.offsetTop + RIM_INSET : RIM_INSET
      // Stage furniture (the badge, the guide chip, the Controls and Guide buttons) and the
      // inspector, in the label layer's coordinates: rim markers and labels both move
      // around them (#118, #160, #132).
      const origin = box?.getBoundingClientRect()
      const local = (el: Element) => {
        const r = el.getBoundingClientRect()
        const ox = origin?.left ?? 0
        const oy = origin?.top ?? 0
        return { l: r.left - ox, r: r.right - ox, t: r.top - oy, b: r.bottom - oy }
      }
      const panel = selectedRef.current && inspectorRef.current ? local(inspectorRef.current) : null
      const furniture = [
        ...(stage.current?.querySelectorAll<HTMLElement>('[data-label-obstacle]') ?? []),
      ]
        .map(local)
        // A hidden button (Controls on a wide screen) has an empty box.
        .filter((b) => b.r > b.l && b.b > b.t)
      if (panel) furniture.push(panel)
      // A label stacked below a body near the time bar ran under it (#130, 390 px).
      if (bar) furniture.push(local(bar))
      // The inspector takes the right or the bottom of the stage: the rim runs inside what
      // it leaves, and what lies under it is out of view, like what lies under the time bar.
      const inset = panelInset({ width, height }, panel)
      const rimBottom = Math.max(bottomInset, inset.bottom + RIM_INSET)
      const freeRight = width - inset.right
      const inView = (i: ProjectedBody) =>
        i.visible && i.x < freeRight && i.y < height - rimBottom + RIM_INSET
      // Deep-space craft beyond the view become rim markers with their true distance,
      // slid apart along the rim when two would overlap, and off the furniture.
      const rim = items.filter((i) => i.kind === 'craft' && !inView(i) && i.group === 'deep-space')
      const rimEdges = new Map(
        rim.map((i) => [
          i.name,
          rimPoint(i.x, i.y, i.behind, freeRight, height, RIM_INSET, rimBottom),
        ]),
      )
      const rimMarkers = rim.map((i) => {
        const p = rimEdges.get(i.name) ?? { x: 0, y: 0, edge: 'top' as const }
        const node = labelNodes.current.get(i.name)
        return {
          key: i.name,
          text: `${i.label} · ${(i.sunAu ?? 0).toFixed(0)} au`,
          x: p.x,
          y: p.y,
          alongX: p.edge === 'top' || p.edge === 'bottom',
          edge: p.edge,
          // Measured when it was a rim marker last frame (the estimate runs short).
          widthPx: node?.dataset['rim'] ? node.offsetWidth : undefined,
        }
      })
      // Craft DSN is talking to, and the deep-space ones, win label room after the voice
      // subject: on a phone Voyager 1's label used to lose to Juno's.
      // So does an object the visitor looked up at JPL and asked to see (#145).
      const boosted = new Set(
        items
          .filter(
            (i) =>
              i.kind === 'lookup' ||
              (i.kind === 'craft' &&
                (i.group === 'deep-space' ||
                  (i.naifId !== undefined && dsnRef.current.has(i.naifId)))),
          )
          .map((i) => i.name),
      )
      const ordered = labelOrder(items, selectedRef.current, subjectNow, boosted)
      // A craft in a close-up but far beyond the focus says how far it is, as a rim marker
      // does (#126: Voyager 2 beside Venus in Parker's view read as nearby). The layout
      // sizes it from last frame's width plus the suffix's change; the write comes last.
      const focusDepth = items.find((i) => i.name === selectedRef.current)?.depth
      const farText = (i: ProjectedBody) =>
        i.kind === 'craft' &&
        !rimEdges.has(i.name) &&
        inView(i) &&
        i.name !== selectedRef.current &&
        farBeyondFocus(i.depth, focusDepth)
          ? ` · ${(i.sunAu ?? 0).toFixed(0)} au`
          : ''
      const suffixes = new Map(items.map((i) => [i.name, farText(i)]))
      // On a small stage only the hazardous and closest close approaches in view keep a
      // label; the rest keep their dots (#130).
      const rankOf = approachRankRef.current
      const labelledAsteroids = asteroidLabelKeys(
        items
          .filter((i) => i.kind === 'asteroid' && inView(i))
          .map((i) => rankOf.get(i.name) ?? { key: i.name, pha: i.pha ?? false, distAu: Infinity }),
        selectedRef.current,
        width,
      )
      // Planets' drawn discs (Saturn's with its rings, #119): craft and moon labels keep
      // off them (#107: Juno on Jupiter).
      const discs = items
        .filter((i) => i.kind === 'body' && i.visible)
        .map((i) => ({ key: i.name, x: i.x, y: i.y, r: bodyLabelReach(i.name, i.radiusPx) }))
      const placed = layoutStage({
        rim: rimMarkers,
        rimSpan: {
          left: RIM_INSET,
          right: freeRight - RIM_INSET,
          top: RIM_INSET,
          bottom: height - rimBottom,
        },
        labels: ordered.map((i) => {
          const node = labelNodes.current.get(i.name)
          // The button's own text (L1's carries the wind speed, #92), with this frame's
          // distance suffix in place of last frame's.
          const shownSuffix = node?.querySelector('[data-rim-distance]')?.textContent ?? ''
          const suffix = suffixes.get(i.name) ?? ''
          const full = node?.textContent ?? i.label
          const text = full.slice(0, full.length - shownSuffix.length) + suffix
          // Measured when shown last frame (the estimate runs ~8% short in this font),
          // adjusted by the suffix's change in characters.
          const measured = node?.offsetWidth ?? 0
          const widthPx =
            measured > 0
              ? measured + (suffix.length - shownSuffix.length) * LABEL_CHAR_PX
              : undefined
          return {
            key: i.name,
            text,
            widthPx,
            x: i.x + bodyLabelReach(i.name, i.radiusPx),
            y: i.y,
            visible: inView(i) && (i.kind !== 'asteroid' || labelledAsteroids.has(i.name)),
            mustShow: i.name === subjectNow,
            priority: i.name === 'Earth' || i.name === 'Sun' || i.name === selectedRef.current,
            // Planets, the focused planet's moons and the deep-space craft try farther rungs
            // before hiding (#131). Voyager 2's label at 390 px had only a slot over the time
            // bar until the bar became furniture (#130); its near slots meet the guide chip.
            farRungs:
              i.kind === 'body' ||
              (i.kind === 'moon' && i.parent === selectedRef.current) ||
              (i.kind === 'craft' && i.group === 'deep-space'),
            avoidDiscs: i.kind !== 'body',
            reach: bodyLabelReach(i.name, i.radiusPx),
          }
        }),
        discs,
        furniture,
        bounds: { width, height },
        previous,
      })
      const rimPlaces = placed.rim
      const shown = placed.labels
      previous = shown
      // Writes from here on.
      const ringNode = ringLabel.current
      if (ringNode) {
        // On a phone-width stage the label would run across the planets: the ring stays,
        // its label goes.
        ringNode.hidden = !ring || width < RING_LABEL_MIN_WIDTH
        if (ring) {
          ringNode.style.left = `${String(ring.x)}px`
          ringNode.style.top = `${String(ring.y)}px`
        }
      }
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
          node.dataset['side'] = ''
          if (distance) distance.textContent = ` · ${(item.sunAu ?? 0).toFixed(0)} au`
          node.hidden = false
          continue
        }
        node.dataset['rim'] = ''
        // A far craft carries its distance (#126); every other label none.
        const suffix = suffixes.get(item.name) ?? ''
        if (distance && distance.textContent !== suffix) distance.textContent = suffix
        if (item.kind === 'craft') node.dataset['far'] = suffix ? 'true' : ''
        const place = shown.get(item.name)
        node.style.left = `${String(item.x + bodyLabelReach(item.name, item.radiusPx) + (place?.dx ?? 0))}px`
        node.style.top = `${String(item.y + (place?.dy ?? 0))}px`
        // A stacked label carries a short rule back to its body (see .label[data-stacked]).
        node.dataset['stacked'] = place && place.dy !== 0 ? String(Math.sign(place.dy)) : ''
        node.style.setProperty('--leader', `${String(Math.abs(place?.dy ?? 0))}px`)
        // Left of its body when the right ran off the stage (#92): the leader moves too.
        node.dataset['side'] = place?.side ?? ''
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
      // A satellite chosen in search or the browser needs its own group on (#98, #158); the
      // ISS is listed before its group loads, so an unloaded one is a station.
      if (isSatKey(key)) {
        const group = renderer?.satellite(key)?.group
        const toggle = group ? toggleForGroup(group) : 'stations'
        setSatToggles((t) => withToggleOn(t, toggle))
      }
      // A comet or interstellar object chosen in search or by a link is drawn (#99).
      showSmallGroupOf(key)
      // A moon moves fast around its planet: the camera holds the planet's neighbourhood,
      // where the moon is drawn (#107).
      renderer?.focusOn(moonParent.get(key) ?? key)
    },
    [renderer, moonParent, showSmallGroupOf],
  )

  // An object looked up at JPL and shown (#145): drawn, searchable and linkable. Removing
  // it, from the search card or the inspector, closes its inspector.
  const lookup = useLookupTrack({ renderer, simMs: sim, select })
  const smallCatalog = small.catalog
  const items = useMemo(() => {
    const listed = [...catalog, ...smallCatalog]
    return lookup.item ? [...listed, lookup.item] : listed
  }, [catalog, smallCatalog, lookup.item])
  useEffect(
    () =>
      useLookupStore.subscribe((s, prev) => {
        if (prev.shown && !s.shown) setSelected((k) => (k && isLookupKey(k) ? null : k))
      }),
    [],
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
    // Earth–Moon/L1 is where the L1 & L2 craft show apart from Earth (#92): turn them on.
    if (p === 'earth') setCraftFilter((f) => (f.l1 ? f : { ...f, l1: true }))
    // On a phone the sheet covers the stage; close it so the new view can be seen.
    setSheetOpen(false)
    renderer?.applyPreset(p)
  }

  // What a link to a satellite needs (#158): the Earth orbit view open so its groups load,
  // then (if it isn't in the groups switched on) every group switched on.
  const openOrbit = useCallback(() => {
    setPreset('orbit')
    renderer?.applyPreset('orbit')
  }, [renderer])
  const widenedFrom = useRef<SatToggles | null>(null)
  const satLink = useMemo(
    () => ({
      has: (key: string) => renderer?.satellite(key) != null,
      // Every switched-on group has loaded or failed (a new switch reads 'off' until the
      // renderer has been told, so it counts as unsettled).
      settled:
        satState !== null &&
        [...enabledSatGroups(satToggles)].every((g) => {
          const status = satState.groups[g]?.status
          return status === 'loaded' || status === 'error'
        }),
      allOn: Object.values(satToggles).every(Boolean),
      version: satState,
      openOrbit,
      widen: () => {
        widenedFrom.current ??= satToggles
        setSatToggles(ALL_SAT_TOGGLES_ON)
      },
      // The switches as they were before widening, plus the found satellite's own group.
      restore: (focus: string | null) => {
        const before = widenedFrom.current
        widenedFrom.current = null
        if (!before) return
        const group = focus ? renderer?.satellite(focus)?.group : undefined
        setSatToggles(group ? withToggleOn(before, toggleForGroup(group)) : before)
      },
    }),
    [renderer, satState, satToggles, openOrbit],
  )

  // The address carries time, focus and preset, so a view can be shared (#108).
  const applyLink = useOrreryLink({
    sats: satLink,
    renderer,
    catalog: items,
    settled: bodies.status === 'success' && near.settled,
    selected,
    preset,
    select,
    applyPreset: onPreset,
    requestLookup: useLookupStore.getState().request,
    lookupFailed: lookup.failed,
    smallBodies: { request: small.request, settled: small.settled },
    // A `detail` link to an object with no model falls back to the focus alone.
    hasModel: (key) => modelForKey(key, (k) => renderer?.satellite(k) ?? null) !== undefined,
    clearSelection: () => {
      setSelected(null)
    },
  })

  // The guide (#159): lessons apply links through the same path a pasted address takes.
  const railGuideButton = useRef<HTMLButtonElement>(null)
  const stageGuideButton = useRef<HTMLButtonElement>(null)
  const guideFocus = useMemo(() => [railGuideButton, stageGuideButton], [])
  const guide = useGuide(applyLink, guideFocus)

  // The labels move round the stage furniture, read each drawn frame: when it changes
  // with nothing else moving (the Controls sheet or the guide chip, paused), ask for a
  // frame so the obstacles are not stale. invalidate() goes through schedule().
  useEffect(() => {
    renderer?.invalidate()
  }, [renderer, sheetOpen, guide.chipVisible, guide.mode])
  // The guide's collapsed bar grows with its tip; the inspector starts below it.
  const [barHeight, setBarHeight] = useState(0)
  const noticesRef = useRef<HTMLDivElement>(null)
  // A lesson's "Play at" (#163) does what the time bar's rate buttons do; the clock
  // subscription above redraws, so nothing here asks for a frame.
  const playAt = useCallback((rate: number) => {
    const clock = useOrreryClock.getState()
    clock.setRate(rate)
    if (!clock.playing) clock.play()
  }, [])

  // With the inspector open over the stage, centre the focus in the part it leaves free:
  // a drawer on the right on wide screens, a sheet along the bottom on phones. On a phone
  // the guide's bar also spans the top, so the free part is the band between them (#159).
  useEffect(() => {
    if (!renderer) return
    const panel = selected ? inspectorRef.current : null
    const box = stage.current
    if (!box) return
    const measure = () => {
      const s = box.getBoundingClientRect()
      const p = panel?.getBoundingClientRect()
      const { right, bottom } = panelInset(
        { width: s.width, height: s.height },
        p
          ? { l: p.left - s.left, r: p.right - s.left, t: p.top - s.top, b: p.bottom - s.top }
          : null,
      )
      const bar = box.querySelector<HTMLElement>('[data-guide-bar]')
      const b = bar?.getBoundingClientRect()
      let top = 0
      if (b && b.width > s.width * 0.6) {
        // The notices sit under a spanning bar (#164): frame the focus below them too.
        const n = noticesRef.current?.getBoundingClientRect()
        const below = n && n.height > 0 ? Math.max(b.bottom, n.bottom) : b.bottom
        top = below - s.top + GUIDE_BAR_GAP_PX
      }
      renderer.setViewInset(right, bottom, top)
      // The detail view leaves this much free for the inspector (#203).
      box.style.setProperty('--inspector-right', `${String(right)}px`)
      box.style.setProperty('--inspector-bottom', `${String(bottom)}px`)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    if (panel) observer.observe(panel)
    observer.observe(box)
    // A notice that appears or goes once the lesson is showing changes the free band.
    if (noticesRef.current) observer.observe(noticesRef.current)
    return () => {
      observer.disconnect()
    }
  }, [renderer, selected, guide.mode, barHeight, detailOpen])

  const voice = voiceFor('orrery', {
    ...VOICE_EMPTY,
    nearest: nearest ? { state: 'ok', data: nearest } : { state: 'error' },
  })
  const outOfRange = heliocentric('Earth', jdNow)
  // Craft and moons outside their data spans hide; the stage says so (#114).
  const noData = bodies.status === 'success' ? noDataNotice(catalog) : null
  // Dwarf planets outside their JPL span (#99 item 8): marker hidden, orbit still drawn.
  const dwarfHidden = small.groups.dwarfs ? dwarfNotice(small.entries, jdNow) : null
  // Satellites past ±3 days of their orbit data are hidden (#98); said while they'd show.
  const satHidden =
    satState && satState.mode !== 'hidden'
      ? satHiddenNotice(satState.outOfWindow, satState.total)
      : null
  const satellite = selected && isSatKey(selected) ? (renderer?.satellite(selected) ?? null) : null
  // Its Space-Track catalogue entry (#101), passed to the inspector with the rest.
  const satCatalog = useSatcatEntry(satellite?.noradId ?? null)
  // The button waits for a satellite's group to load, so it follows `satState` too.
  const lookDescriptor = useMemo(
    () => (selected ? modelForKey(selected, (k) => renderer?.satellite(k) ?? null) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- satState says a group loaded
    [selected, renderer, satState],
  )
  const detailTitle =
    (detail && isSatKey(detail) ? satellite?.name : tracks.find((t) => t.id === detail)?.name) ??
    detail ??
    ''
  const craftStatus = craftStatusText(
    bodies.status,
    craftTracks.length,
    bodies.dataAgeSeconds,
    bodies.degraded,
  )

  return (
    <div
      ref={root}
      className={styles.page ?? ''}
      data-orrery-page=""
      data-detail={detailOpen ? 'open' : undefined}
    >
      <div className={styles.voiceStrip ?? ''}>
        <p className={consoleStyles.voice ?? ''}>{voice}</p>
        <p className={consoleStyles.sub ?? ''}>
          Solar system in 3D · planets from JPL approximate elements, spacecraft from JPL Horizons ·
          drag to turn, pinch or scroll to zoom, right-drag or two fingers to slide
        </p>
      </div>

      <ControlRail
        open={sheetOpen}
        guideOpen={guide.mode !== 'closed'}
        onGuide={() => {
          // On a phone the sheet would sit under the guide: close it, as choosing a preset does.
          setSheetOpen(false)
          guide.open()
        }}
        guideRef={railGuideButton}
        visibility={visibility}
        onVisibility={setVisibility}
        scale={scale}
        onScale={setScale}
        preset={preset}
        onPreset={onPreset}
        onSelect={select}
        items={items}
        craftFilter={craftFilter}
        onCraftFilter={setCraftFilter}
        craftStatus={craftStatus}
        dsnCount={craftTracks.filter((t) => dsnIds.has(t.naifId)).length}
        smallBodies={
          <>
            <DwarfControls
              on={small.groups.dwarfs}
              onChange={(dwarfs) => {
                small.setGroups({ ...small.groups, dwarfs })
              }}
              status={small.dwarfStatus}
            />
            <SmallBodyControls
              groups={small.groups}
              onGroups={small.setGroups}
              status={small.status}
            />
          </>
        }
        nearEarth={
          <NeoControls
            filter={near.filter}
            onFilter={near.setFilter}
            shown={near.shown}
            total={near.approaches.length}
            status={near.status}
            scout={near.scout}
            sunLine={near.sunLine}
            onSunLine={near.setSunLine}
            onSelect={select}
          />
        }
        earthOrbit={
          <SatControls
            toggles={satToggles}
            onToggles={setSatToggles}
            status={satState ? satStatusText(satState) : 'Loading…'}
            boxscore={spaceTrack?.boxscore}
            reentriesThisWeek={reentries.length}
            browse={{
              field: renderer && satState ? renderer.satField() : null,
              groups: satState?.groups ?? NO_GROUP_STATES,
              reentries,
              reentryNames: spaceTrack?.names ?? NO_NAMES,
              reentriesAvailable: spaceTrack?.tip != null,
              onChoose: select,
              onOpenOrbit: openOrbit,
            }}
          />
        }
      />

      <section
        ref={stage}
        className={styles.stage ?? ''}
        aria-label="Orrery"
        data-guide={guide.mode}
        data-detail={detailOpen ? 'open' : undefined}
        style={{ '--guide-bar-h': `${String(barHeight)}px` } as CSSProperties}
      >
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
          {near.approaches.map((a) => (
            <button
              key={a.id}
              type="button"
              hidden
              data-kind="asteroid"
              data-pha={a.pha}
              ref={(el) => {
                if (el) labelNodes.current.set(a.id, el)
                else labelNodes.current.delete(a.id)
              }}
              className={`${styles.label ?? ''} ${styles.asteroidLabel ?? ''}`}
              aria-pressed={selected === a.id}
              onClick={() => {
                select(a.id)
              }}
            >
              {catalog.find((i) => i.key === a.id)?.label ?? a.des}
            </button>
          ))}
          <button
            type="button"
            hidden
            data-kind="marker"
            ref={(el) => {
              if (el) labelNodes.current.set(L1_KEY, el)
              else labelNodes.current.delete(L1_KEY)
            }}
            className={`${styles.label ?? ''} ${styles.markerLabel ?? ''}`}
            aria-pressed={selected === L1_KEY}
            onClick={() => {
              select(L1_KEY)
            }}
          >
            L1
            {near.wind?.speed != null ? ` · ${String(Math.round(near.wind.speed))} km/s` : ''}
          </button>
          {satellite && (
            <button
              key={satellite.key}
              type="button"
              hidden
              data-kind="satellite"
              ref={(el) => {
                if (el) labelNodes.current.set(satellite.key, el)
                else labelNodes.current.delete(satellite.key)
              }}
              className={`${styles.label ?? ''} ${styles.moonLabel ?? ''}`}
              aria-pressed
              onClick={() => {
                select(satellite.key)
              }}
            >
              {satellite.name}
            </button>
          )}
          {lookup.key && (
            <button
              key={lookup.key}
              type="button"
              hidden
              data-kind="lookup"
              ref={(el) => {
                const k = lookup.key ?? ''
                if (el) labelNodes.current.set(k, el)
                else labelNodes.current.delete(k)
              }}
              className={`${styles.label ?? ''} ${styles.lookupLabel ?? ''}`}
              aria-pressed={selected === lookup.key}
              onClick={() => {
                if (lookup.key) select(lookup.key)
              }}
            >
              {lookup.label}
            </button>
          )}
          {small.entries.map((e) => (
            <button
              key={e.key}
              type="button"
              hidden
              data-kind="smallbody"
              ref={(el) => {
                if (el) labelNodes.current.set(e.key, el)
                else labelNodes.current.delete(e.key)
              }}
              className={`${styles.label ?? ''} ${LABEL_CLASS[e.group] ?? ''}`}
              aria-pressed={selected === e.key}
              onClick={() => {
                select(e.key)
              }}
            >
              {e.label}
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
        <p className={styles.badge ?? ''} data-label-obstacle="">
          {scale === 'proportional' ? 'SIZES NOT TO SCALE' : 'NOT TO SCALE'}
        </p>
        <div ref={noticesRef} className={styles.notices ?? ''}>
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
          {!failed && dwarfHidden && (
            <p className={styles.notice ?? ''} role="status" data-orrery-dwarf-notice="">
              {dwarfHidden}
            </p>
          )}
          {!failed && satHidden && (
            <p className={styles.notice ?? ''} role="status" data-orrery-sat-notice="">
              {satHidden}
            </p>
          )}
        </div>
        <button
          type="button"
          className={`${styles.chipBtn ?? ''} ${styles.sheetToggle ?? ''}`}
          data-label-obstacle=""
          aria-expanded={sheetOpen}
          aria-controls="orrery-controls"
          onClick={() => {
            setSheetOpen((o) => !o)
          }}
        >
          {sheetOpen ? 'Close controls' : 'Controls'}
        </button>
        <button
          ref={stageGuideButton}
          type="button"
          className={`${styles.chipBtn ?? ''} ${styles.guideToggle ?? ''}`}
          data-label-obstacle=""
          aria-expanded={guide.mode !== 'closed'}
          aria-controls="orrery-guide"
          onClick={guide.open}
        >
          Guide
        </button>
        {guide.chipVisible && guide.mode === 'closed' && (
          <GuideChip onOpen={guide.open} onDismiss={guide.dismissChip} />
        )}
        {guide.mode !== 'closed' && (
          <Suspense fallback={null}>
            <OrreryGuide
              mode={guide.mode}
              shown={guide.shown}
              onShow={guide.show}
              onPlay={playAt}
              onExpand={guide.expand}
              onClose={guide.close}
              onBarHeight={setBarHeight}
            />
          </Suspense>
        )}
        {detail &&
          detailDescriptor &&
          (DetailViewComponent ? (
            // eslint-disable-next-line react-hooks/static-components -- see above
            <DetailViewComponent
              key={detail}
              descriptor={detailDescriptor}
              title={detailTitle}
              reducedMotion={reducedMotion}
              onClose={(cause) => {
                if (cause === 'user') backToOrrery()
                else closeDetail()
              }}
              onStats={reportDetailStats}
            />
          ) : (
            <DetailLoading onClose={backToOrrery} />
          ))}
        {selected && (
          <Inspector
            ref={inspectorRef}
            body={selected}
            simMs={sim}
            tracks={tracks}
            dsn={dsn}
            sun={sun}
            moons={moons}
            neo={near.neo}
            wind={near.wind}
            cme={near.cme}
            satellite={satellite}
            lookup={lookup}
            onRemoveLookup={useLookupStore.getState().clear}
            smallBody={small.find(selected)}
            discos={discos}
            reentries={reentries}
            satCatalog={satCatalog}
            lookCloser={
              lookDescriptor
                ? {
                    onOpen: () => {
                      openDetail(selected)
                    },
                    open: detailOpen,
                    controls: detailOpen ? DETAIL_VIEW_ID : undefined,
                  }
                : undefined
            }
            lookCloserRef={lookCloserRef}
            facts={
              detailOpen
                ? {
                    open: factsOpen,
                    onToggle: () => {
                      setFactsOpen((open) => !open)
                    },
                  }
                : undefined
            }
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
