import { memo } from 'react'

import { useProjected } from '../useGlobeProjection'

export interface GlobeEvent {
  lat: number
  lon: number
  kind: string
}

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

interface EventMarkersProps {
  events: readonly GlobeEvent[]
  rotation: number
  R: number
  onHover: (index: number | null) => void
}

/**
 * EONET event markers. The only focusable layer on the globe, so it carries the
 * list semantics. No activation handler exists, so these are deliberately not
 * `role="button"`. They are focusable readouts, announced via aria-label.
 */
export const EventMarkers = memo(function EventMarkers({
  events,
  rotation,
  R,
  onHover,
}: EventMarkersProps) {
  const projected = useProjected(events, rotation, R)
  if (projected.length === 0) return null

  return (
    <g role="list" aria-label="Earth events">
      {projected.map(({ point: e, index, x, y }) => {
        const c = EVENT_COLORS[e.kind] ?? 'var(--amber)'
        const letter = EVENT_LETTER[e.kind] ?? '?'
        const delayS = ((index * 0.19) % 2.6).toFixed(2)
        return (
          <g
            key={index}
            style={{ cursor: 'pointer' }}
            tabIndex={0}
            role="listitem"
            aria-label={`${EVENT_NAME[e.kind] ?? e.kind} at ${e.lat.toFixed(1)}°, ${e.lon.toFixed(1)}°`}
            onMouseEnter={() => {
              onHover(index)
            }}
            onMouseLeave={() => {
              onHover(null)
            }}
            onFocus={() => {
              onHover(index)
            }}
            onBlur={() => {
              onHover(null)
            }}
          >
            <title>
              {EVENT_NAME[e.kind] ?? e.kind} — {e.lat.toFixed(1)}° {e.lon.toFixed(1)}°
            </title>
            <circle cx={x} cy={y} r="16" fill="transparent" pointerEvents="all" />
            <circle cx={x} cy={y} r="7" fill="none" stroke={c} strokeWidth="0.8" opacity="0">
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
            <circle cx={x} cy={y} r="4" fill={c} opacity="0.95" />
            <text
              x={x}
              y={y + 3.5}
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
    </g>
  )
})

interface EventTooltipProps {
  event: GlobeEvent | null
  /** Projected marker position, globe-local coordinates. */
  pos: { x: number; y: number; visible: boolean } | null
  center: number
}

/** HTML overlay tooltip for the hovered/focused EONET marker. */
export const EventTooltip = memo(function EventTooltip({ event, pos, center }: EventTooltipProps) {
  if (event === null || pos === null || !pos.visible) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x + center + 10,
        top: pos.y + center - 28,
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
          color: EVENT_COLORS[event.kind] ?? 'var(--amber)',
        }}
      >
        {EVENT_NAME[event.kind] ?? event.kind}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--bone-faint)',
          marginTop: 2,
        }}
      >
        {event.lat.toFixed(2)}° {event.lon.toFixed(2)}°
      </div>
    </div>
  )
})
