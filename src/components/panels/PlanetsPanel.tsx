import { useQueryClient } from '@tanstack/react-query'
import { usePlanets } from '@/hooks/usePlanets'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { DataAge } from '@/components/ui/DataAge'
import type { Planet } from '@/schemas/planets'
import styles from './planets-panel.module.css'

const COLORS: Record<string, string> = {
  Sun: 'oklch(0.9 0.16 90)',
  Moon: 'oklch(0.9 0.02 250)',
  Mercury: 'oklch(0.72 0.03 70)',
  Venus: 'oklch(0.92 0.08 95)',
  Mars: 'oklch(0.62 0.2 25)',
  Jupiter: 'oklch(0.78 0.09 70)',
  Saturn: 'oklch(0.85 0.08 95)',
  Uranus: 'oklch(0.82 0.1 200)',
  Neptune: 'oklch(0.65 0.15 250)',
}

const STRIP_W = 300
const STRIP_H = 40
const ELONG_VISIBLE = 18 // degrees from the Sun to clear twilight glare

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
        <div className={styles.loading ?? ''}>Plotting ephemerides...</div>
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="Planets Tonight">
        <div className={styles.unavailable ?? ''}>Data unavailable</div>
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
            stroke="var(--glass-border)"
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
                fill="oklch(0.9 0.16 90)"
                opacity={0.08}
              />
              <circle cx={raX(sun.raHours)} cy={STRIP_H / 2} r={4} fill={COLORS.Sun} />
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
                  fill={COLORS[p.name] ?? 'var(--bone)'}
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
          <span>0h</span>
          <span>RA</span>
          <span>24h</span>
        </div>

        <ul className={styles.list ?? ''}>
          {sorted.map((p: Planet) => {
            const visible = p.elongation >= ELONG_VISIBLE
            return (
              <li key={p.name} className={styles.row ?? ''}>
                <span
                  className={styles.dot ?? ''}
                  style={{ background: COLORS[p.name] ?? 'var(--bone)' }}
                />
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
