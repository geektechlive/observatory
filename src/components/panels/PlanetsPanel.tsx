import { useQueryClient } from '@tanstack/react-query'

import { DataAge } from '@/components/ui/DataAge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Label } from '@/components/ui/Label'
import { PanelState } from '@/components/ui/PanelState'
import { Swatch } from '@/components/ui/Swatch'
import { usePlanets } from '@/hooks/usePlanets'
import { BODY_HEX } from '@/lib/palette'
import type { Planet } from '@/schemas/planets'

import styles from './planets-panel.module.css'

const STRIP_W = 300
const STRIP_H = 40
const ELONG_VISIBLE = 18 // degrees from the Sun to clear twilight glare
const FALLBACK_BODY = 'var(--bone)'

function dotRadius(mag: number | null): number {
  if (mag === null) return 3
  // brighter (lower mag) → larger
  return Math.min(6, Math.max(2, 4.5 - mag * 0.4))
}

function raX(raHours: number): number {
  return (raHours / 24) * STRIP_W
}

export function PlanetsPanel() {
  const { data, isLoading, error } = usePlanets()
  const updatedAt = useQueryClient().getQueryState(['planets'])?.dataUpdatedAt ?? 0

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="Planets Tonight">
        <PanelState kind="loading" detail="Plotting ephemerides" />
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="Planets Tonight">
        <PanelState kind="unavailable" detail="JPL Horizons is not answering" />
      </GlassPanel>
    )
  }

  const sun = data.bodies.find((b) => b.name === 'Sun')
  const planets = data.bodies.filter((b) => b.name !== 'Sun')
  const sorted = [...planets].sort((a, b) => b.elongation - a.elongation)

  return (
    <GlassPanel variant="tile" label="Planets Tonight">
      <DataAge updatedAt={updatedAt} />
      <div className={styles.panel ?? ''}>
        <svg
          className={styles.strip ?? ''}
          viewBox={`0 0 ${STRIP_W} ${STRIP_H}`}
          role="img"
          aria-label="Planet positions by right ascension relative to the Sun"
          preserveAspectRatio="none"
        >
          {/* RA baseline */}
          <line
            x1={0}
            x2={STRIP_W}
            y1={STRIP_H / 2}
            y2={STRIP_H / 2}
            stroke="var(--plate-edge)"
            strokeWidth={0.5}
          />
          {/* Sun glare zone (~±2h RA) */}
          {sun && (
            <>
              <rect
                x={Math.max(0, raX(sun.raHours) - STRIP_W * (2 / 24))}
                y={0}
                width={STRIP_W * (4 / 24)}
                height={STRIP_H}
                fill={BODY_HEX['Sun']}
                opacity={0.08}
              />
              <circle cx={raX(sun.raHours)} cy={STRIP_H / 2} r={4} fill={BODY_HEX['Sun']} />
            </>
          )}
          {planets.map((p) => {
            const x = raX(p.raHours)
            return (
              <g key={p.name}>
                <title>
                  {p.name} — RA {p.raHours.toFixed(1)}h, elong {Math.round(p.elongation)}°
                </title>
                <circle
                  cx={x}
                  cy={STRIP_H / 2}
                  r={dotRadius(p.mag)}
                  fill={BODY_HEX[p.name] ?? FALLBACK_BODY}
                />
                <text
                  x={x}
                  y={STRIP_H / 2 - 7}
                  textAnchor="middle"
                  fontSize={5}
                  fontFamily="var(--font-stencil)"
                  fill="var(--bone-dim)"
                  aria-hidden="true"
                >
                  {p.name[0]}
                </text>
              </g>
            )
          })}
        </svg>
        <div className={styles.axis ?? ''} aria-hidden="true">
          <Label>0h</Label>
          <Label>RA</Label>
          <Label>24h</Label>
        </div>

        <ul className={styles.list ?? ''}>
          {sorted.map((p: Planet) => {
            const visible = p.elongation >= ELONG_VISIBLE
            return (
              <li key={p.name} className={styles.row ?? ''}>
                <Swatch color={BODY_HEX[p.name] ?? FALLBACK_BODY} />
                <span className={styles.name ?? ''}>{p.name}</span>
                <span className={styles.mag ?? ''}>
                  {p.mag !== null ? `m ${p.mag.toFixed(1)}` : '—'}
                </span>
                <span
                  className={`${styles.vis ?? ''} ${visible ? (styles.visOk ?? '') : (styles.visGlare ?? '')}`}
                >
                  {visible ? `${Math.round(p.elongation)}° from ☉` : 'near Sun'}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </GlassPanel>
  )
}
