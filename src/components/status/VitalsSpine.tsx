import { useSolarWind } from '@/hooks/useSolarWind'
import { useSolarActivity } from '@/hooks/useSolarActivity'
import { usePeopleInSpace } from '@/hooks/usePeopleInSpace'
import { useLaunches } from '@/hooks/useLaunches'
import { useQuakes } from '@/hooks/useQuakes'
import { useNow } from '@/hooks/useNow'
import styles from './vitals-spine.module.css'

function Cell({
  label,
  value,
  unit,
  color,
}: {
  label: string
  value: string
  unit?: string
  color?: string | undefined
}) {
  return (
    <div className={styles.cell ?? ''}>
      <span className={styles.label ?? ''}>{label}</span>
      <span className={styles.value ?? ''} style={color ? { color } : undefined}>
        {value}
        {unit && <span className={styles.unit ?? ''}>{unit}</span>}
      </span>
    </div>
  )
}

function kpColor(kp: number): string {
  if (kp >= 6) return 'var(--magenta)'
  if (kp >= 4) return 'var(--amber)'
  return 'var(--cyan)'
}
function flareColor(cls: string | null): string {
  if (!cls) return 'var(--ink-dim)'
  const c = cls[0]
  if (c === 'X') return 'var(--magenta)'
  if (c === 'M') return 'var(--amber)'
  if (c === 'C') return 'var(--terminal)'
  return 'var(--cyan)'
}
function quakeColor(m: number): string {
  if (m >= 6) return 'var(--magenta)'
  if (m >= 4.5) return 'var(--amber)'
  return 'var(--bone)'
}

function nextLaunchCountdown(net: string | null, now: Date): string {
  if (!net) return '—'
  const diff = new Date(net).getTime() - now.getTime()
  if (diff <= 0) return 'GO'
  const s = Math.floor(diff / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${String(h).padStart(2, '0')}h`
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function VitalsSpine() {
  const { data: sw } = useSolarWind()
  const { data: sa } = useSolarActivity()
  const { data: people } = usePeopleInSpace()
  const { data: launches } = useLaunches()
  const { data: quakeData } = useQuakes()
  const now = useNow()

  const kp = sw?.currentKp ?? null
  const windSpeed = sw?.windSpeed ?? null
  const flare = sa?.xray.currentClass ?? null
  const humans = people?.number ?? null

  const nextLaunch = launches?.result?.[0]
  const net = nextLaunch?.t0 ?? nextLaunch?.win_open ?? null

  const strongest = (quakeData?.quakes ?? []).reduce<number | null>(
    (max, q) => (q.mag !== null && (max === null || q.mag > max) ? q.mag : max),
    null,
  )

  return (
    <div className={styles.spine ?? ''} aria-label="Live vital signs">
      <span className={styles.live ?? ''} aria-hidden="true">
        <span className={styles.liveDot ?? ''} />
        LIVE
      </span>
      <div className={styles.cells ?? ''}>
        <Cell
          label="Kp"
          value={kp !== null ? kp.toFixed(1) : '—'}
          color={kp !== null ? kpColor(kp) : undefined}
        />
        <Cell label="X-RAY" value={flare ?? '—'} color={flareColor(flare)} />
        <Cell
          label="WIND"
          value={windSpeed !== null ? String(Math.round(windSpeed)) : '—'}
          unit=" km/s"
        />
        <Cell
          label="IN SPACE"
          value={humans !== null ? String(humans) : '—'}
          color="var(--signal)"
        />
        <Cell label="NEXT LAUNCH" value={`T- ${nextLaunchCountdown(net, now)}`} />
        <Cell
          label="MAX QUAKE 24H"
          value={strongest !== null ? `M${strongest.toFixed(1)}` : '—'}
          color={strongest !== null ? quakeColor(strongest) : undefined}
        />
      </div>
    </div>
  )
}
