import { useQueryClient } from '@tanstack/react-query'
import { useSunMoon } from '@/hooks/useSunMoon'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { DataAge } from '@/components/ui/DataAge'
import { isWaxing, moonLitPath } from '@/lib/moon'
import styles from './sun-moon-panel.module.css'

const MOON_R = 34

function MoonDisc({ phase, illum }: { phase: string; illum: number }) {
  const waxing = isWaxing(phase)
  const lit = moonLitPath(MOON_R, illum / 100, waxing)
  return (
    <svg
      className={styles.moonSvg ?? ''}
      viewBox={`${-MOON_R - 2} ${-MOON_R - 2} ${(MOON_R + 2) * 2} ${(MOON_R + 2) * 2}`}
      role="img"
      aria-label={`${phase}, ${illum}% illuminated`}
    >
      <circle
        r={MOON_R}
        fill="oklch(0.18 0.01 250)"
        stroke="var(--glass-border)"
        strokeWidth={0.5}
      />
      <path d={lit} fill="oklch(0.92 0.03 95)" opacity={0.92} />
      <circle r={MOON_R} fill="none" stroke="var(--glass-border)" strokeWidth={0.6} />
    </svg>
  )
}

function daysUntil(dateStr: string): number | null {
  const target = new Date(`${dateStr}T00:00:00`)
  if (isNaN(target.getTime())) return null
  const now = new Date()
  const diff = target.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diff / 86400000))
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className={styles.row ?? ''}>
      <span className={styles.rowLabel ?? ''}>{label}</span>
      <span className={styles.rowValue ?? ''}>{value ?? '—'}</span>
    </div>
  )
}

export function SunMoonPanel() {
  const { data, isLoading, error, isFallbackLocation } = useSunMoon()
  const updatedAt = useQueryClient().getQueryState(['sun-moon'])?.dataUpdatedAt ?? 0

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="Sun & Moon" breathe>
        <div className={styles.loading ?? ''}>Loading...</div>
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="Sun & Moon" breathe>
        <div className={styles.unavailable ?? ''}>Data unavailable</div>
      </GlassPanel>
    )
  }

  const next = data.closestPhase
  const days = next ? daysUntil(next.date) : null

  return (
    <GlassPanel variant="tile" label="Sun & Moon" breathe>
      <DataAge updatedAt={updatedAt} />
      <div className={styles.panel ?? ''}>
        <div className={styles.moonRow ?? ''}>
          <MoonDisc phase={data.curPhase} illum={data.fracIllum} />
          <div className={styles.moonMeta ?? ''}>
            <span className={styles.phaseName ?? ''}>{data.curPhase}</span>
            <span className={styles.illum ?? ''}>{data.fracIllum}% illuminated</span>
            {next && (
              <span className={styles.nextPhase ?? ''}>
                {next.phase}
                {days !== null && (
                  <span className={styles.nextDays ?? ''}>
                    {' '}
                    · {days === 0 ? 'today' : `${days}d`}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        <div className={styles.times ?? ''}>
          <div className={styles.timesCol ?? ''}>
            <span className={styles.colHead ?? ''}>☉ Sun</span>
            <Row label="Rise" value={data.sun.rise} />
            <Row label="Set" value={data.sun.set} />
            <Row label="Civil" value={data.sun.civilBegin} />
          </div>
          <div className={styles.timesCol ?? ''}>
            <span className={styles.colHead ?? ''}>☾ Moon</span>
            <Row label="Rise" value={data.moon.rise} />
            <Row label="Set" value={data.moon.set} />
            <Row label="Phase" value={`${data.fracIllum}%`} />
          </div>
        </div>

        <div className={styles.footer ?? ''}>
          {isFallbackLocation
            ? 'Greenwich (location off)'
            : `${data.lat.toFixed(1)}°, ${data.lon.toFixed(1)}° · local`}
        </div>
      </div>
    </GlassPanel>
  )
}
