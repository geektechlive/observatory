import { forwardRef, useImperativeHandle, useRef } from 'react'

import type { CensusState, LaneCensus } from '@/lib/census'
import { LANES } from '@/lib/palette'

import styles from './globe-bezel.module.css'

/** Width of the machined ring outside the globe, in design px. */
export const BEZEL_WIDTH = 38

export interface GlobeBezelHandle {
  /** Turn the bearing scale so it reads the longitude the lens is facing. */
  setFacing(lonDeg: number): void
}

interface GlobeBezelProps {
  /** Globe diameter in design px; the bezel draws around it. */
  size: number
  census: readonly LaneCensus[]
}

const RAD = Math.PI / 180
/** The census arc: 270° clockwise from bottom-left, with a gap at the bottom. */
const ARC_START = -135
const ARC_SPAN = 270
const ARC_GAP = 3
/** Every lane keeps a readable segment, whatever its count. */
const MIN_SEGMENT = 18

const STATE_LABEL: Record<CensusState, (count: number) => string> = {
  live: (n) => String(n),
  zero: () => '0',
  stale: (n) => String(n),
  loading: () => '…',
  error: () => 'ERR',
  off: () => '',
}

function point(c: number, r: number, deg: number): [number, number] {
  return [c + r * Math.sin(deg * RAD), c - r * Math.cos(deg * RAD)]
}

function arcPath(c: number, r: number, from: number, to: number): string {
  const [x0, y0] = point(c, r, from)
  const [x1, y1] = point(c, r, to)
  return `M${String(x0)} ${String(y0)}A${String(r)} ${String(r)} 0 ${to - from > 180 ? 1 : 0} 1 ${String(x1)} ${String(y1)}`
}

/** Segment angles: a floor per lane, the rest shared by sqrt(count) so 64 satellites don't drown 2 fireballs. */
function segments(census: readonly LaneCensus[]): { lane: LaneCensus; from: number; to: number }[] {
  const usable = ARC_SPAN - ARC_GAP * (census.length - 1) - MIN_SEGMENT * census.length
  const weights = census.map((l) =>
    l.state === 'live' || l.state === 'stale' ? Math.sqrt(l.count) : 0,
  )
  const total = weights.reduce((a, b) => a + b, 0)
  let at = ARC_START
  return census.map((lane, i) => {
    const span =
      MIN_SEGMENT + (total > 0 ? (usable * (weights[i] ?? 0)) / total : usable / census.length)
    const seg = { lane, from: at, to: at + span }
    at += span + ARC_GAP
    return seg
  })
}

const BEARING_LABELS = Array.from({ length: 12 }, (_, i) => i * 30)

function bearingText(deg: number): string {
  const lon = deg > 180 ? deg - 360 : deg
  if (lon === 0 || lon === 180) return String(Math.abs(lon))
  return `${String(Math.abs(lon))}${lon > 0 ? 'E' : 'W'}`
}

/**
 * The instrument bezel (#51): a machined copper ring around the lens, carrying a
 * bearing scale that turns with the facing longitude and a live lane census. Drawn
 * in design px (viewBox = px), so text sits at the 11px floor at full size; on
 * narrow screens the numerals hide rather than shrink below it.
 */
export const GlobeBezel = forwardRef<GlobeBezelHandle, GlobeBezelProps>(function GlobeBezel(
  { size, census },
  ref,
) {
  const scale = useRef<SVGGElement>(null)
  const box = size + 2 * BEZEL_WIDTH
  const c = box / 2
  const rGlobe = size / 2
  const rArc = rGlobe + 7
  const rTickIn = rGlobe + 14
  const rTickOut = rGlobe + 22
  const rLabel = rGlobe + 31

  useImperativeHandle(ref, () => ({
    setFacing(lonDeg: number) {
      // The facing longitude sits at the top, under the reticle mark.
      scale.current?.setAttribute(
        'transform',
        `rotate(${String(-lonDeg)} ${String(c)} ${String(c)})`,
      )
    },
  }))

  const ticks = Array.from({ length: 72 }, (_, i) => i * 5)
  const summary = census
    .map((l) => `${LANES[l.lane].label}: ${l.state === 'live' ? String(l.count) : l.state}`)
    .join(', ')

  return (
    <svg
      className={styles.bezel ?? ''}
      viewBox={`0 0 ${String(box)} ${String(box)}`}
      role="img"
      aria-label={`Live census. ${summary}`}
    >
      <defs>
        <linearGradient id="bezel-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className={styles.ringLight ?? ''} />
          <stop offset="0.5" className={styles.ringMid ?? ''} />
          <stop offset="1" className={styles.ringDark ?? ''} />
        </linearGradient>
      </defs>
      {/* the machined ring: reflective, lit from the top left */}
      <circle
        cx={c}
        cy={c}
        r={rGlobe + BEZEL_WIDTH / 2}
        className={styles.ring ?? ''}
        strokeWidth={BEZEL_WIDTH - 2}
      />
      <circle cx={c} cy={c} r={rGlobe + 1} className={styles.innerLip ?? ''} />
      <circle cx={c} cy={c} r={c - 1} className={styles.outerLip ?? ''} />

      <g ref={scale}>
        {ticks.map((deg) => {
          const major = deg % 30 === 0
          const [x0, y0] = point(c, rTickOut, deg)
          const [x1, y1] = point(c, major ? rTickIn - 3 : rTickIn, deg)
          return (
            <line
              key={deg}
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
              className={major ? styles.tickMajor : styles.tickMinor}
            />
          )
        })}
        {BEARING_LABELS.map((deg) => {
          const [x, y] = point(c, rLabel, deg)
          return (
            <text
              key={deg}
              x={x}
              y={y}
              className={`${styles.numeral ?? ''} ${deg % 90 === 0 ? (styles.cardinal ?? '') : ''}`}
              transform={`rotate(${String(deg)} ${String(x)} ${String(y)})`}
            >
              {bearingText(deg)}
            </text>
          )
        })}
      </g>

      {/* reticle mark at the top: the facing longitude reads here */}
      <path d={`M${String(c)} ${String(BEZEL_WIDTH - 12)}v10`} className={styles.reticle ?? ''} />

      {segments(census).map(({ lane, from, to }) => {
        const mid = (from + to) / 2
        const [lx, ly] = point(c, rArc, mid)
        return (
          <g
            key={lane.lane}
            data-lane={lane.lane}
            data-state={lane.state}
            className={styles.segment ?? ''}
          >
            <path
              d={arcPath(c, rArc, from, to)}
              style={{ stroke: `var(--data-${lane.lane}-emit)` }}
            />
            {lane.state !== 'off' && (
              <text x={lx} y={ly} className={styles.count ?? ''}>
                {STATE_LABEL[lane.state](lane.count)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
})
