import { memo } from 'react'

import { Overlay } from '@/components/ui/Overlay'
import { Readout } from '@/components/ui/Readout'
import { Swatch } from '@/components/ui/Swatch'
import { eonetKind, LANES, VOID_HEX } from '@/lib/palette'

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
              fill={VOID_HEX}
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

/**
 * HTML overlay tooltip for the hovered/focused EONET marker. Text wears ink; the
 * swatch carries the lane colour (identity is never colour-on-text).
 */
export const EventTooltip = memo(function EventTooltip({ event, pos, center }: EventTooltipProps) {
  if (event === null || pos === null || !pos.visible) return null
  const kind = eonetKind(event.kind)
  return (
    <Overlay kind="tooltip" x={pos.x + center + 10} y={pos.y + center - 28}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <Swatch color={LANES[kind.lane].emit} />
        {kind.label}
      </span>
      <Readout
        value={`${event.lat.toFixed(2)}° ${event.lon.toFixed(2)}°`}
        style={{ color: 'var(--bone-faint)' }}
      />
    </Overlay>
  )
})
