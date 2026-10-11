import { memo } from 'react'

import { eonetKind, LANES } from '@/lib/palette'

import { useProjected } from '../useGlobeProjection'

export interface GlobeEvent {
  lat: number
  lon: number
  kind: string
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
        const c = LANES[eonetKind(e.kind).lane].emit
        const letter = eonetKind(e.kind).letter
        const delayS = ((index * 0.19) % 2.6).toFixed(2)
        return (
          <g
            key={index}
            style={{ cursor: 'pointer' }}
            tabIndex={0}
            role="listitem"
            aria-label={`${eonetKind(e.kind).label} at ${e.lat.toFixed(1)}°, ${e.lon.toFixed(1)}°`}
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
              {eonetKind(e.kind).label} — {e.lat.toFixed(1)}° {e.lon.toFixed(1)}°
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
          color: LANES[eonetKind(event.kind).lane].emit,
        }}
      >
        {eonetKind(event.kind).label}
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
