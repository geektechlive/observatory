import { useMemo, useEffect, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import * as topojson from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import landTopo from 'world-atlas/land-110m.json'

// ---------------------------------------------------------------------------
// Real coastline data — processed once at module load
// GeoJSON is [lon, lat]; our project() takes (lat, lon) — swapped on import
// ---------------------------------------------------------------------------
const LAND_RINGS: [number, number][][] = (() => {
  const topo = landTopo as unknown as Topology<{ land: GeometryCollection }>
  const geo = topojson.feature(topo, topo.objects.land)
  const rings: [number, number][][] = []
  const features = 'features' in geo ? geo.features : [geo]
  for (const feature of features) {
    const geom = feature.geometry
    if (!geom) continue
    const polys =
      geom.type === 'Polygon'
        ? [geom.coordinates]
        : geom.type === 'MultiPolygon'
          ? geom.coordinates
          : []
    for (const poly of polys) {
      const ring = poly[0]
      if (!ring || ring.length < 6) continue
      rings.push(ring.map((coord) => [coord[1] ?? 0, coord[0] ?? 0] as [number, number]))
    }
  }
  return rings
})()

// ---------------------------------------------------------------------------
// Fallback sinusoid orbit (used only when no real trail is available)
// ---------------------------------------------------------------------------
const FALLBACK_ORBIT: [number, number][] = (() => {
  const pts: [number, number][] = []
  for (let lon = -180; lon <= 180; lon += 2) pts.push([51.6 * Math.sin((lon * Math.PI) / 180), lon])
  return pts
})()

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface GlobeEvent {
  lat: number
  lon: number
  kind: string
}

interface GlobeLaunch {
  lat: number
  lon: number
  name: string
}

interface GlobeProps {
  size?: number | undefined
  issLat?: number | undefined
  issLon?: number | undefined
  /** SGP4 trail from useIss() — [lon, lat][] pairs, ~90 min window */
  trail?: readonly [number, number][] | undefined
  events?: GlobeEvent[] | undefined
  launches?: GlobeLaunch[] | undefined
  warm?: boolean | undefined
  autoRotate?: boolean | undefined
  radarSweep?: boolean | undefined
}

// ---------------------------------------------------------------------------
// Orthographic projection
// ---------------------------------------------------------------------------
function project(lat: number, lon: number, rotation: number, R: number) {
  const lr = ((lon + rotation + 540) % 360) - 180
  const phi = (lat * Math.PI) / 180
  const lam = (lr * Math.PI) / 180
  const x = Math.cos(phi) * Math.sin(lam)
  const y = Math.sin(phi)
  const z = Math.cos(phi) * Math.cos(lam)
  return { x: x * R, y: -y * R, z, visible: z > 0 }
}

// Pen-up path — never emits Z, handles back-hemisphere gaps correctly
function penPath(
  points: [number, number][],
  rotation: number,
  R: number,
  backHemi = false,
): string {
  let d = ''
  let penDown = false
  for (const [lat, lon] of points) {
    const p = project(lat, lon, rotation, R)
    const draw = backHemi ? p.z <= 0 : p.z > 0
    if (!draw) {
      penDown = false
      continue
    }
    d += penDown ? `L${p.x.toFixed(1)},${p.y.toFixed(1)}` : `M${p.x.toFixed(1)},${p.y.toFixed(1)}`
    penDown = true
  }
  return d
}

// Coastline path — pen-up, tracks whether all points are front-hemisphere
// Rings that straddle the boundary must be stroke-only to avoid SVG fill chord artifacts
function coastPathData(
  coords: [number, number][],
  rotation: number,
  R: number,
): { d: string; full: boolean } {
  let d = ''
  let penDown = false
  let full = true
  for (const [lat, lon] of coords) {
    const p = project(lat, lon, rotation, R)
    if (!p.visible) {
      full = false
      penDown = false
      continue
    }
    d += penDown ? `L${p.x.toFixed(1)},${p.y.toFixed(1)}` : `M${p.x.toFixed(1)},${p.y.toFixed(1)}`
    penDown = true
  }
  return { d, full }
}

// ---------------------------------------------------------------------------
// Static graticule point arrays
// ---------------------------------------------------------------------------
const LAT_LINES = [-60, -30, 0, 30, 60].map((lat) => {
  const pts: [number, number][] = []
  for (let lon = -180; lon <= 180; lon += 3) pts.push([lat, lon])
  return pts
})
const LON_LINES = [-120, -90, -60, -30, 0, 30, 60, 90, 120].map((lon) => {
  const pts: [number, number][] = []
  for (let lat = -90; lat <= 90; lat += 3) pts.push([lat, lon])
  return pts
})

// ---------------------------------------------------------------------------
// Event categories — colors and labels
// ---------------------------------------------------------------------------
const EVENT_COLORS: Record<string, string> = {
  wildfires: 'oklch(0.72 0.22 32)',
  fire: 'oklch(0.72 0.22 32)',
  earthquakes: 'oklch(0.90 0.20 96)',
  severeStorms: 'oklch(0.82 0.20 215)',
  volcanoes: 'oklch(0.72 0.22 320)',
  floods: 'oklch(0.65 0.18 248)',
  landslides: 'oklch(0.72 0.12 65)',
  seaLakeIce: 'oklch(0.92 0.04 194)',
  drought: 'oklch(0.90 0.20 96)',
}
const EVENT_LETTER: Record<string, string> = {
  wildfires: 'F',
  fire: 'F',
  earthquakes: 'E',
  severeStorms: 'S',
  volcanoes: 'V',
  floods: 'W',
  landslides: 'L',
  seaLakeIce: 'I',
}
const EVENT_NAME: Record<string, string> = {
  wildfires: 'Wildfire',
  fire: 'Wildfire',
  earthquakes: 'Earthquake',
  severeStorms: 'Severe Storm',
  volcanoes: 'Volcano',
  floods: 'Flood',
  landslides: 'Landslide',
  seaLakeIce: 'Sea/Lake Ice',
  drought: 'Drought',
}

const LAUNCH_COLOR = 'oklch(0.84 0.16 80)'

const LEGEND_ITEMS = [
  { key: 'wildfires', label: 'F  Wildfire', color: 'oklch(0.72 0.22 32)' },
  { key: 'earthquakes', label: 'E  Earthquake', color: 'oklch(0.90 0.20 96)' },
  { key: 'severeStorms', label: 'S  Storm', color: 'oklch(0.82 0.20 215)' },
  { key: 'volcanoes', label: 'V  Volcano', color: 'oklch(0.72 0.22 320)' },
  { key: 'floods', label: 'W  Flood', color: 'oklch(0.65 0.18 248)' },
  { key: 'seaLakeIce', label: 'I  Sea Ice', color: 'oklch(0.92 0.04 194)' },
  { key: 'launch', label: '▲  Launch Pad', color: LAUNCH_COLOR },
  { key: 'iss', label: '◉  ISS', color: 'var(--signal)' },
]

// ---------------------------------------------------------------------------
// Globe component
// ---------------------------------------------------------------------------
export function Globe({
  size = 460,
  issLat,
  issLon,
  trail,
  events = [],
  launches = [],
  warm = true,
  autoRotate = true,
  radarSweep = false,
}: GlobeProps) {
  const reducedMotion = useReducedMotion()
  const [rotation, setRotation] = useState(-12)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const R = size / 2 - 10
  const center = size / 2

  const hasIss = issLat !== undefined && issLon !== undefined
  const continentColor = warm ? 'oklch(0.62 0.13 48)' : 'oklch(0.82 0.13 220)'
  const continentFill = warm ? 'oklch(0.62 0.13 48 / 0.62)' : 'oklch(0.82 0.13 220 / 0.55)'
  const issColor = 'var(--signal)'
  const uid = warm ? 'w' : 'c'

  // 0.60°/100ms = 6°/sec ≈ 60-sec full rotation
  useEffect(() => {
    if (!autoRotate) return
    const id = setInterval(() => setRotation((r) => (r + 0.6) % 360), 100)
    return () => clearInterval(id)
  }, [autoRotate])

  // Convert real SGP4 trail ([lon,lat]) → ([lat,lon]) for our projection
  const orbitPts = useMemo<[number, number][]>(() => {
    if (trail && trail.length > 0) {
      return trail.map((pt) => [pt[1] ?? 0, pt[0] ?? 0])
    }
    return FALLBACK_ORBIT
  }, [trail])

  // Coastlines from world-atlas 110m
  const coastData = useMemo(
    () => LAND_RINGS.map((ring) => coastPathData(ring, rotation, R)).filter((x) => x.d !== ''),
    [rotation, R],
  )

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

  const issDot = hasIss ? project(issLat, issLon, rotation, R) : null

  // Hover tooltip: compute screen position from SVG coordinates
  const hoveredEvent = hoveredIdx !== null ? events[hoveredIdx] : null
  const hoveredPos =
    hoveredEvent !== undefined && hoveredEvent !== null
      ? project(hoveredEvent.lat, hoveredEvent.lon, rotation, R)
      : null

  return (
    <div style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: 'block' }}
        role="img"
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

          {/* 1b — Radar sweep: pure SVG so mix-blend-mode composites correctly */}
          {radarSweep && (
            <g clipPath={`url(#sphere-clip-${uid})`} style={{ mixBlendMode: 'screen' }}>
              {/* Range rings at 33% and 67% */}
              <circle
                r={R * 0.33}
                fill="none"
                stroke="oklch(0.85 0.13 220)"
                strokeWidth="0.5"
                opacity={0.1}
              />
              <circle
                r={R * 0.67}
                fill="none"
                stroke="oklch(0.85 0.13 220)"
                strokeWidth="0.5"
                opacity={0.1}
              />
              {/* Rotating sweep arm — SMIL rotate at globe center (0,0) */}
              <g>
                {!reducedMotion && (
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 0 0"
                    to="360 0 0"
                    dur="6s"
                    repeatCount="indefinite"
                  />
                )}
                {/* Fading trailing arc — 5 sectors, opacity decays from lead edge to trailing edge */}
                {(
                  [
                    { a1: 264, a2: 270, opacity: 0.22 },
                    { a1: 258, a2: 264, opacity: 0.12 },
                    { a1: 252, a2: 258, opacity: 0.06 },
                    { a1: 246, a2: 252, opacity: 0.03 },
                    { a1: 240, a2: 246, opacity: 0.01 },
                  ] as { a1: number; a2: number; opacity: number }[]
                ).map(({ a1, a2, opacity }, i) => {
                  const a1r = (a1 * Math.PI) / 180
                  const a2r = (a2 * Math.PI) / 180
                  const x1 = (Math.cos(a1r) * R).toFixed(1)
                  const y1 = (Math.sin(a1r) * R).toFixed(1)
                  const x2 = (Math.cos(a2r) * R).toFixed(1)
                  const y2 = (Math.sin(a2r) * R).toFixed(1)
                  return (
                    <path
                      key={i}
                      d={`M 0 0 L ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2} Z`}
                      fill="oklch(0.85 0.13 220)"
                      opacity={opacity}
                    />
                  )
                })}
                {/* Bright leading arm */}
                <line
                  x1={0}
                  y1={0}
                  x2={0}
                  y2={-R}
                  stroke="oklch(0.95 0.16 220)"
                  strokeWidth="2"
                  opacity={0.75}
                  filter={`url(#glow-${uid})`}
                />
              </g>
            </g>
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
            d={penPath(LAT_LINES[2] ?? [], rotation, R)}
            fill="none"
            stroke={continentColor}
            strokeWidth="0.6"
            opacity="0.4"
            strokeDasharray="2 3"
          />

          {/* 5 — Real coastlines */}
          <g stroke={continentColor} strokeWidth="0.5" opacity="0.95">
            {coastData.map((item, i) => (
              <path
                key={`land${i}`}
                d={item.d}
                fill={item.full ? continentFill : 'none'}
                strokeWidth={item.full ? '0.4' : '0.8'}
              />
            ))}
          </g>

          {/* 6 — Limb darkening */}
          <circle r={R} fill={`url(#rim-${uid})`} pointerEvents="none" />

          {/* 7 — Atmosphere rings */}
          <circle r={R + 1.5} fill="none" stroke={continentColor} strokeWidth="0.5" opacity="0.5" />
          <circle r={R + 7} fill="none" stroke={continentColor} strokeWidth="0.4" opacity="0.10" />
          <circle r={R + 15} stroke="oklch(0.45 0.10 220 / 0.18)" strokeWidth={0.5} fill="none" />

          {/* 8 — EONET event markers */}
          {events.map((e, i) => {
            const p = project(e.lat, e.lon, rotation, R)
            if (!p.visible) return null
            const c = EVENT_COLORS[e.kind] ?? 'var(--amber)'
            const letter = EVENT_LETTER[e.kind] ?? '?'
            const delayS = ((i * 0.19) % 2.6).toFixed(2)
            return (
              <g
                key={i}
                style={{ cursor: 'pointer' }}
                tabIndex={0}
                role="button"
                aria-label={`${EVENT_NAME[e.kind] ?? e.kind} at ${e.lat.toFixed(1)}°, ${e.lon.toFixed(1)}°`}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                onFocus={() => setHoveredIdx(i)}
                onBlur={() => setHoveredIdx(null)}
              >
                <title>
                  {EVENT_NAME[e.kind] ?? e.kind} — {e.lat.toFixed(1)}° {e.lon.toFixed(1)}°
                </title>
                <circle cx={p.x} cy={p.y} r="16" fill="transparent" pointerEvents="all" />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="7"
                  fill="none"
                  stroke={c}
                  strokeWidth="0.8"
                  opacity="0"
                >
                  <animate
                    attributeName="r"
                    values="5;18;5"
                    dur="2.6s"
                    begin={`${delayS}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.85;0;0.85"
                    dur="2.6s"
                    begin={`${delayS}s`}
                    repeatCount="indefinite"
                  />
                </circle>
                <circle cx={p.x} cy={p.y} r="4" fill={c} opacity="0.95" />
                <text
                  x={p.x}
                  y={p.y + 3.5}
                  textAnchor="middle"
                  fill="oklch(0.08 0.01 50)"
                  fontSize="5"
                  fontFamily="var(--font-stencil)"
                  fontWeight="700"
                  pointerEvents="none"
                  aria-hidden="true"
                >
                  {letter}
                </text>
              </g>
            )
          })}

          {/* 9 — Launch pad markers */}
          {launches.map((lp, i) => {
            const p = project(lp.lat, lp.lon, rotation, R)
            if (!p.visible) return null
            const h = 9
            const w = 6
            return (
              <g key={i}>
                <title>Launch pad: {lp.name}</title>
                <polygon
                  points={`${p.x},${p.y - h} ${p.x - w},${p.y + 4} ${p.x + w},${p.y + 4}`}
                  fill={LAUNCH_COLOR}
                  stroke="oklch(0.08 0.01 50)"
                  strokeWidth="0.6"
                  opacity="0.9"
                />
              </g>
            )
          })}

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

          {/* 10 — ISS tactical crosshair marker + label */}
          {hasIss && issDot?.visible && (
            <g transform={`translate(${issDot.x} ${issDot.y})`} filter="url(#iss-glow)">
              {/* Outer ring */}
              <circle r={9} fill="none" stroke={issColor} strokeWidth="1.5" />
              {/* Gap crosshair — 4 lines not touching center */}
              <line x1={-16} y1={0} x2={-11} y2={0} stroke={issColor} strokeWidth="1.2" />
              <line x1={11} y1={0} x2={16} y2={0} stroke={issColor} strokeWidth="1.2" />
              <line x1={0} y1={-16} x2={0} y2={-11} stroke={issColor} strokeWidth="1.2" />
              <line x1={0} y1={11} x2={0} y2={16} stroke={issColor} strokeWidth="1.2" />
              {/* Center dot */}
              <circle r={2.5} fill={issColor} />
              {/* Pulsing acquisition ring */}
              <circle r="14" fill="none" stroke={issColor} strokeWidth="0.6" opacity="0">
                <animate attributeName="r" values="12;24;12" dur="2.4s" repeatCount="indefinite" />
                <animate
                  attributeName="opacity"
                  values="0.75;0;0.75"
                  dur="2.4s"
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          )}
          {hasIss && issDot?.visible && (
            <text
              x={(issDot?.x ?? 0) + 18}
              y={(issDot?.y ?? 0) - 10}
              fill={issColor}
              fontSize="10"
              fontFamily="var(--font-stencil)"
              letterSpacing="0.12em"
              opacity="0.9"
              pointerEvents="none"
              aria-hidden="true"
            >
              ISS-1
            </text>
          )}

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
      {hoveredPos?.visible && hoveredEvent !== null && hoveredEvent !== undefined && (
        <div
          style={{
            position: 'absolute',
            left: hoveredPos.x + center + 10,
            top: hoveredPos.y + center - 28,
            pointerEvents: 'none',
            background: 'oklch(0.10 0.02 50 / 0.92)',
            border: '1px solid var(--plate-edge)',
            borderRadius: 2,
            padding: '4px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-stencil)',
              fontSize: 9,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: EVENT_COLORS[hoveredEvent.kind] ?? 'var(--amber)',
            }}
          >
            {EVENT_NAME[hoveredEvent.kind] ?? hoveredEvent.kind}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--bone-faint)',
              marginTop: 2,
            }}
          >
            {hoveredEvent.lat.toFixed(2)}° {hoveredEvent.lon.toFixed(2)}°
          </div>
        </div>
      )}

      {/* Legend — lower-left corner overlay */}
      <div
        aria-label="Globe legend"
        style={{
          position: 'absolute',
          bottom: 52,
          left: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          padding: '8px 10px',
          background: 'oklch(0.08 0.01 50 / 0.82)',
          border: '1px solid var(--plate-seam)',
          borderRadius: 2,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-stencil)',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--copper-glow)',
            marginBottom: 2,
          }}
        >
          LEGEND
        </div>
        {LEGEND_ITEMS.map((item) => (
          <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: item.color,
                flexShrink: 0,
                display: 'inline-block',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.06em',
                color: 'var(--bone-dim)',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
