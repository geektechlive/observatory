import { useEffect, useMemo, useState } from 'react'

import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useVisible } from '@/hooks/useVisible'
import { horizonRadiusDeg, smallCircleRing, subsolarPoint } from '@/lib/solar'

import { AuroraCanvas } from './markers/AuroraCanvas'
import { Coastlines } from './markers/Coastlines'
import { DisasterMarkers, type GlobeDisaster } from './markers/DisasterMarkers'
import { EventMarkers, EventTooltip, type GlobeEvent } from './markers/EventMarkers'
import { FireballMarkers, type GlobeFireball } from './markers/FireballMarkers'
import { FireMarkers, type GlobeFire } from './markers/FireMarkers'
import { IssMarker } from './markers/IssMarker'
import { type GlobeLaunch, LaunchPadMarkers } from './markers/LaunchPadMarkers'
import { type GlobeQuake, QuakeMarkers } from './markers/QuakeMarkers'
import { RadarSweep } from './markers/RadarSweep'
import { type GlobeSatellite, SatelliteMarkers } from './markers/SatelliteMarkers'
import { StationMarkers } from './markers/StationMarkers'
import { FALLBACK_ORBIT, LAT_LINES, LON_LINES, penPath, project } from './useGlobeProjection'

// Stable empty defaults. A fresh `[]` literal per render would defeat the
// React.memo bail-out on every marker layer.
const NO_EVENTS: readonly GlobeEvent[] = []
const NO_LAUNCHES: readonly GlobeLaunch[] = []
const NO_FIREBALLS: readonly GlobeFireball[] = []
const NO_QUAKES: readonly GlobeQuake[] = []
const NO_DISASTERS: readonly GlobeDisaster[] = []
const NO_SATELLITES: readonly GlobeSatellite[] = []
const NO_FIRES: readonly GlobeFire[] = []
const NO_AURORA: readonly [number, number, number][] = []

// 0.60°/100ms = 6°/sec ≈ 60-sec full rotation
const ROTATION_STEP_DEG = 0.6
const ROTATION_INTERVAL_MS = 100
const SUBSOLAR_REFRESH_MS = 60000
const DEFAULT_ISS_ALT_KM = 420

interface GlobeProps {
  size?: number | undefined
  issLat?: number | undefined
  issLon?: number | undefined
  /** ISS altitude, km — sizes the visibility footprint. */
  issAlt?: number | undefined
  /** SGP4 trail from useIss() — [lon, lat][] pairs, ~90 min window */
  trail?: readonly [number, number][] | undefined
  events?: readonly GlobeEvent[] | undefined
  launches?: readonly GlobeLaunch[] | undefined
  fireballs?: readonly GlobeFireball[] | undefined
  quakes?: readonly GlobeQuake[] | undefined
  disasters?: readonly GlobeDisaster[] | undefined
  satellites?: readonly GlobeSatellite[] | undefined
  fires?: readonly GlobeFire[] | undefined
  warm?: boolean | undefined
  autoRotate?: boolean | undefined
  radarSweep?: boolean | undefined
  /** Day/night terminator overlay. */
  showTerminator?: boolean | undefined
  /** ORBIT "tracking station" mode — shows DSN ground stations + tracking decor. */
  tracking?: boolean | undefined
  /** OVATION aurora oval — [lon, lat, intensity] triplets, drawn on a canvas overlay. */
  aurora?: readonly [number, number, number][] | undefined
}

export function Globe({
  size = 460,
  issLat,
  issLon,
  issAlt,
  trail,
  events = NO_EVENTS,
  launches = NO_LAUNCHES,
  fireballs = NO_FIREBALLS,
  quakes = NO_QUAKES,
  disasters = NO_DISASTERS,
  satellites = NO_SATELLITES,
  fires = NO_FIRES,
  warm = true,
  autoRotate = true,
  radarSweep = false,
  showTerminator = true,
  tracking = false,
  aurora = NO_AURORA,
}: GlobeProps) {
  const reducedMotion = useReducedMotion()
  const visible = useVisible()
  const [rotation, setRotation] = useState(-12)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  // Real-world subsolar point — recomputed each minute (the globe's visual spin
  // is a separate `rotation` offset, so the terminator is painted in lat/lon).
  const [subsolar, setSubsolar] = useState(() => subsolarPoint(new Date()))

  const R = size / 2 - 10
  const center = size / 2

  const hasIss = issLat !== undefined && issLon !== undefined
  const continentColor = warm ? 'oklch(0.62 0.13 48)' : 'oklch(0.82 0.13 220)'
  const continentFill = warm ? 'oklch(0.62 0.13 48 / 0.62)' : 'oklch(0.82 0.13 220 / 0.55)'
  const issColor = 'var(--signal)'
  const uid = warm ? 'w' : 'c'
  const glowFilter = `url(#glow-${uid})`

  // rAF-driven spin, throttled to the same 100ms cadence the old setInterval
  // used. Parked entirely while the tab is hidden or motion is reduced.
  useEffect(() => {
    if (!autoRotate || reducedMotion || !visible) return
    let frame = 0
    let last = performance.now()
    const step = (now: number) => {
      frame = requestAnimationFrame(step)
      if (now - last < ROTATION_INTERVAL_MS) return
      last = now
      setRotation((r) => (r + ROTATION_STEP_DEG) % 360)
    }
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [autoRotate, reducedMotion, visible])

  // Refresh the subsolar point once a minute (terminator drift is slow).
  useEffect(() => {
    if (!showTerminator) return
    const id = setInterval(() => {
      setSubsolar(subsolarPoint(new Date()))
    }, SUBSOLAR_REFRESH_MS)
    return () => {
      clearInterval(id)
    }
  }, [showTerminator])

  // Convert real SGP4 trail ([lon,lat]) → ([lat,lon]) for our projection
  const orbitPts = useMemo<[number, number][]>(() => {
    if (trail && trail.length > 0) return trail.map((pt) => [pt[1], pt[0]])
    return FALLBACK_ORBIT
  }, [trail])

  // Orbit: split front (z>0, over continents) and back (z≤0, ghost before sphere)
  const { orbitFront, orbitBack } = useMemo(
    () => ({
      orbitFront: penPath(orbitPts, rotation, R, false),
      orbitBack: penPath(orbitPts, rotation, R, true),
    }),
    [orbitPts, rotation, R],
  )

  // Graticule
  const latPaths = useMemo(() => LAT_LINES.map((pts) => penPath(pts, rotation, R)), [rotation, R])
  const lonPaths = useMemo(() => LON_LINES.map((pts) => penPath(pts, rotation, R)), [rotation, R])
  const equatorPath = useMemo(() => penPath(LAT_LINES[2] ?? [], rotation, R), [rotation, R])

  const issDot = hasIss ? project(issLat, issLon, rotation, R) : null

  // Day/night terminator: great circle 90° from the subsolar point.
  const terminatorRing = useMemo(
    () => (showTerminator ? smallCircleRing(subsolar.lat, subsolar.lon, 90, 120) : []),
    [showTerminator, subsolar],
  )
  const terminatorPath = useMemo(
    () => penPath(terminatorRing, rotation, R),
    [terminatorRing, rotation, R],
  )
  const subsolarDot =
    showTerminator && terminatorRing.length > 0
      ? project(subsolar.lat, subsolar.lon, rotation, R)
      : null

  // ISS visibility footprint (small circle at the horizon angular radius).
  const footprintRing = useMemo(
    () =>
      hasIss
        ? smallCircleRing(issLat, issLon, horizonRadiusDeg(issAlt ?? DEFAULT_ISS_ALT_KM), 72)
        : [],
    [hasIss, issLat, issLon, issAlt],
  )
  const footprintPath = useMemo(
    () => penPath(footprintRing, rotation, R),
    [footprintRing, rotation, R],
  )

  // Hover readout: resolve against the unfiltered events array.
  const hoveredEvent = hoveredIdx !== null ? (events[hoveredIdx] ?? null) : null
  const hoveredPos = hoveredEvent ? project(hoveredEvent.lat, hoveredEvent.lon, rotation, R) : null

  return (
    <div style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
      <AuroraCanvas aurora={aurora} rotation={rotation} R={R} center={center} size={size} />
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: 'block' }}
        role="group"
        aria-label="Orthographic globe — Earth, ISS position, EONET events"
      >
        <defs>
          <radialGradient id={`grad-${uid}`} cx="35%" cy="30%">
            <stop offset="0%" stopColor={warm ? 'oklch(0.22 0.05 50)' : 'oklch(0.20 0.04 220)'} />
            <stop
              offset="65%"
              stopColor={warm ? 'oklch(0.12 0.025 50)' : 'oklch(0.10 0.015 220)'}
            />
            <stop offset="100%" stopColor="oklch(0.05 0.005 50)" />
          </radialGradient>
          <radialGradient id={`rim-${uid}`} cx="50%" cy="50%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="60%" stopColor="transparent" />
            <stop offset="100%" stopColor="oklch(0.04 0.005 50)" stopOpacity="0.8" />
          </radialGradient>
          <filter id={`glow-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="iss-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={1.2} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id={`sphere-clip-${uid}`}>
            <circle cx={0} cy={0} r={R} />
          </clipPath>
        </defs>

        <g transform={`translate(${center} ${center})`}>
          {/* 1 — Sphere */}
          <circle r={R} fill={`url(#grad-${uid})`} />

          {/* 1b — Radar sweep */}
          {radarSweep && (
            <RadarSweep
              R={R}
              clipPathId={`sphere-clip-${uid}`}
              glowFilter={glowFilter}
              reducedMotion={reducedMotion}
            />
          )}

          {/* 2 — Back orbit ghost */}
          {hasIss && orbitBack && (
            <path
              d={orbitBack}
              fill="none"
              stroke={issColor}
              strokeWidth="0.5"
              strokeDasharray="2 5"
              opacity="0.09"
              filter="url(#iss-glow)"
            />
          )}

          {/* 3 — Graticule */}
          <g fill="none" stroke={continentColor} strokeWidth="0.3" opacity="0.16">
            {latPaths.map((d, i) => d && <path key={`lat${i}`} d={d} />)}
            {lonPaths.map((d, i) => d && <path key={`lon${i}`} d={d} />)}
          </g>

          {/* 4 — Equator accent */}
          <path
            d={equatorPath}
            fill="none"
            stroke={continentColor}
            strokeWidth="0.6"
            opacity="0.4"
            strokeDasharray="2 3"
          />

          {/* 5 — Real coastlines */}
          <Coastlines
            rotation={rotation}
            R={R}
            strokeColor={continentColor}
            fillColor={continentFill}
          />

          {/* 5b — Day/night terminator: blurred twilight band + crisp boundary */}
          {showTerminator && terminatorPath && (
            <g clipPath={`url(#sphere-clip-${uid})`} pointerEvents="none">
              <path
                d={terminatorPath}
                fill="none"
                stroke="oklch(0.10 0.02 250)"
                strokeWidth="16"
                opacity="0.32"
                filter={glowFilter}
              />
              <path
                d={terminatorPath}
                fill="none"
                stroke="oklch(0.75 0.08 250)"
                strokeWidth="0.6"
                strokeDasharray="3 4"
                opacity="0.5"
              />
            </g>
          )}
          {subsolarDot?.visible && (
            <g transform={`translate(${subsolarDot.x} ${subsolarDot.y})`} pointerEvents="none">
              <circle r={5} fill="oklch(0.92 0.13 90)" opacity="0.9" filter={glowFilter} />
              <circle r={2.5} fill="oklch(0.98 0.06 90)" />
            </g>
          )}

          {/* 6 — Limb darkening */}
          <circle r={R} fill={`url(#rim-${uid})`} pointerEvents="none" />

          {/* 7 — Atmosphere rings */}
          <circle r={R + 1.5} fill="none" stroke={continentColor} strokeWidth="0.5" opacity="0.5" />
          <circle r={R + 7} fill="none" stroke={continentColor} strokeWidth="0.4" opacity="0.10" />
          <circle r={R + 15} stroke="oklch(0.45 0.10 220 / 0.18)" strokeWidth={0.5} fill="none" />

          {/* 7b — FIRMS active fires (hot dots, background layer) */}
          <FireMarkers fires={fires} rotation={rotation} R={R} />

          {/* 8 — EONET event markers */}
          <EventMarkers events={events} rotation={rotation} R={R} onHover={setHoveredIdx} />

          {/* 8b — Seismic markers */}
          <QuakeMarkers quakes={quakes} rotation={rotation} R={R} />

          {/* 8c — GDACS disaster-alert markers */}
          <DisasterMarkers disasters={disasters} rotation={rotation} R={R} />

          {/* 8d — DSN ground stations (ORBIT tracking mode) */}
          {tracking && <StationMarkers rotation={rotation} R={R} color={issColor} />}

          {/* 9 — Launch pad markers */}
          <LaunchPadMarkers launches={launches} rotation={rotation} R={R} />

          {/* 9b — Fireball markers */}
          <FireballMarkers
            fireballs={fireballs}
            rotation={rotation}
            R={R}
            glowFilter={glowFilter}
          />

          {/* 9c — ISS visibility footprint */}
          {hasIss && footprintPath && (
            <path
              d={footprintPath}
              fill={issColor}
              fillOpacity="0.05"
              stroke={issColor}
              strokeWidth="0.6"
              strokeDasharray="2 3"
              opacity="0.5"
              pointerEvents="none"
            />
          )}

          {/* 10 — Front orbit arc */}
          {hasIss && orbitFront && (
            <path
              d={orbitFront}
              fill="none"
              stroke={issColor}
              strokeWidth="0.9"
              strokeDasharray="3 4"
              opacity="0.75"
              filter="url(#iss-glow)"
            />
          )}

          {/* 9d — Other tracked satellites (Hubble, Tiangong) */}
          <SatelliteMarkers satellites={satellites} rotation={rotation} R={R} />

          {/* 10 — ISS tactical crosshair marker + label */}
          {hasIss && <IssMarker dot={issDot} color={issColor} />}

          {/* 11 — Tactical reticle */}
          <g stroke={continentColor} strokeWidth="0.6" fill="none" opacity="0.45">
            <line x1={-R - 6} y1={0} x2={-R - 14} y2={0} />
            <line x1={R + 6} y1={0} x2={R + 14} y2={0} />
            <line x1={0} y1={-R - 6} x2={0} y2={-R - 14} />
            <line x1={0} y1={R + 6} x2={0} y2={R + 14} />
          </g>
        </g>
      </svg>

      {/* Hover tooltip — HTML overlay, positioned from SVG coords */}
      <EventTooltip event={hoveredEvent} pos={hoveredPos} center={center} />
    </div>
  )
}
