import { TickRing } from '@/components/ui/TickRing'
import { domePoint, type HourRow, type SkyPoint } from '@/lib/sky/track'

import styles from './sky-view-panel.module.css'

/** The bezel's size in its own units; CSS scales it to the box. */
const RING_SIZE = 400
/** The dome's radius as a share of the box, inside the bezel's ticks. */
const DOME_SHARE = 0.41
/** Compass letters sit this far out in the dome. */
const LETTER_SHARE = 0.88
const COMPASS = [
  { letter: 'N', azimuth: 0 },
  { letter: 'E', azimuth: 90 },
  { letter: 'S', azimuth: 180 },
  { letter: 'W', azimuth: 270 },
] as const
const ALTITUDE_RINGS = [30, 60] as const

interface SkyDomeProps {
  name: string
  /** 'comet' or 'asteroid': picks the track's lane colour (tokens only). */
  kind: 'comet' | 'asteroid'
  /** The text equivalent, as the image's label. */
  label: string
  segments: readonly (readonly SkyPoint[])[]
  /** Hour marks along the track; only those above the horizon are drawn. */
  hours: readonly HourRow[]
  /** Where it is at the moment shown, if that is above the horizon. */
  marker: SkyPoint | null
}

const boxPercent = (v: number, share: number) => `${String(50 + v * share * 100)}%`

/**
 * The alt-az dome: zenith at the centre, the horizon as the rim, north up and east on the
 * LEFT, as when looking up (owner, 2026-11-12). Every label is HTML, positioned in percent,
 * so none falls under the 11 px floor when the dome shrinks; the SVG draws shapes only.
 * The track, hour marks and marker are Horizons samples, never extrapolated (track.ts).
 */
export function SkyDome({ name, kind, label, segments, hours, marker }: SkyDomeProps) {
  const lane = kind === 'comet' ? styles.laneComet : styles.laneAsteroid
  const at = (p: { altitude: number; azimuth: number }) => domePoint(p.altitude, p.azimuth)
  const up = hours.filter((h) => h.altitude !== null && h.altitude >= 0 && h.azimuth !== null)
  const markerPoint = marker ? at(marker) : null
  return (
    <div className={`${styles.dome ?? ''} ${lane ?? ''}`}>
      <div className={styles.bezel ?? ''}>
        <TickRing size={RING_SIZE} step={5} major={45} />
      </div>
      <svg className={styles.domeSvg ?? ''} viewBox="-1 -1 2 2" role="img" aria-label={label}>
        <circle r={1} className={styles.well ?? ''} />
        {ALTITUDE_RINGS.map((alt) => (
          <circle key={alt} r={(90 - alt) / 90} className={styles.altRing ?? ''} />
        ))}
        <line x1={-1} y1={0} x2={1} y2={0} className={styles.axis ?? ''} />
        <line x1={0} y1={-1} x2={0} y2={1} className={styles.axis ?? ''} />
        {segments.map((seg) => (
          <polyline
            key={seg[0]?.time.getTime() ?? 0}
            className={styles.track ?? ''}
            points={seg
              .map((p) => {
                const { x, y } = at(p)
                return `${x.toFixed(4)},${y.toFixed(4)}`
              })
              .join(' ')}
          />
        ))}
        {up.map((h) => {
          const { x, y } = at({ altitude: h.altitude ?? 0, azimuth: h.azimuth ?? 0 })
          return (
            <circle
              key={h.time.getTime()}
              cx={x}
              cy={y}
              r={0.016}
              className={styles.hourDot ?? ''}
            />
          )
        })}
        {markerPoint && (
          <circle
            data-testid="sky-marker"
            cx={markerPoint.x}
            cy={markerPoint.y}
            r={0.045}
            className={styles.marker ?? ''}
          />
        )}
      </svg>
      {COMPASS.map(({ letter, azimuth }) => {
        const { x, y } = domePoint(0, azimuth)
        return (
          <span
            key={letter}
            data-testid={`compass-${letter}`}
            className={styles.compass ?? ''}
            style={{
              left: boxPercent(x, DOME_SHARE * LETTER_SHARE),
              top: boxPercent(y, DOME_SHARE * LETTER_SHARE),
            }}
            aria-hidden="true"
          >
            {letter}
          </span>
        )
      })}
      {ALTITUDE_RINGS.map((alt) => {
        const { x, y } = domePoint(alt, 225)
        return (
          <span
            key={alt}
            className={styles.altLabel ?? ''}
            style={{ left: boxPercent(x, DOME_SHARE), top: boxPercent(y, DOME_SHARE) }}
            aria-hidden="true"
          >
            {`${String(alt)}°`}
          </span>
        )
      })}
      {up.map((h) => {
        const { x, y } = at({ altitude: h.altitude ?? 0, azimuth: h.azimuth ?? 0 })
        return (
          <span
            key={h.time.getTime()}
            className={styles.hourLabel ?? ''}
            style={{ left: boxPercent(x, DOME_SHARE), top: boxPercent(y, DOME_SHARE) }}
            aria-hidden="true"
          >
            {String(h.time.getHours()).padStart(2, '0')}
          </span>
        )
      })}
      {markerPoint && (
        <span
          className={styles.markerLabel ?? ''}
          style={{
            left: boxPercent(markerPoint.x, DOME_SHARE),
            top: boxPercent(markerPoint.y, DOME_SHARE),
          }}
          aria-hidden="true"
        >
          {name}
        </span>
      )}
    </div>
  )
}
