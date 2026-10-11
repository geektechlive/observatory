import { Readout, type ReadoutTone } from '@/components/ui/Readout'
import { useGeomag } from '@/hooks/useGeomag'
import { useLaunches } from '@/hooks/useLaunches'
import { useNow } from '@/hooks/useNow'
import { usePeopleInSpace } from '@/hooks/usePeopleInSpace'
import { useQuakes } from '@/hooks/useQuakes'
import { useSolarActivity } from '@/hooks/useSolarActivity'
import { useSolarWind } from '@/hooks/useSolarWind'
import { dstStatus, flareStatus, kpStatus, quakeStatus } from '@/lib/severity'

import styles from './vitals-spine.module.css'

function Cell({
  label,
  value,
  unit,
  tone,
}: {
  label: string
  value: string
  unit?: string
  tone?: ReadoutTone | undefined
}) {
  return (
    <div className={styles.cell ?? ''}>
      <span className={styles.label ?? ''}>{label}</span>
      <Readout value={value} unit={unit} tone={tone} className={styles.value ?? ''} />
    </div>
  )
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
  const { data: geomag } = useGeomag()
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
  const flareTone = flareStatus(flare) ?? undefined

  // A labelled, focusable region: the strip scrolls sideways, and Safari only lets the
  // keyboard scroll a container that can take focus.
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div className={styles.spine ?? ''} role="region" aria-label="Live vital signs" tabIndex={0}>
      <span className={styles.live ?? ''} aria-hidden="true">
        <span className={styles.liveDot ?? ''} />
        LIVE
      </span>
      <div className={styles.cells ?? ''}>
        <Cell
          label="Kp"
          value={kp !== null ? kp.toFixed(1) : '—'}
          tone={kp !== null ? kpStatus(kp) : undefined}
        />
        <Cell label="X-RAY" value={flare ?? '—'} tone={flareTone} />
        <Cell
          label="DST"
          value={geomag?.currentDst != null ? String(geomag.currentDst) : '—'}
          unit="nT"
          tone={geomag?.currentDst != null ? dstStatus(geomag.currentDst) : undefined}
        />
        <Cell
          label="WIND"
          value={windSpeed !== null ? String(Math.round(windSpeed)) : '—'}
          unit="km/s"
        />
        <Cell label="IN SPACE" value={humans !== null ? String(humans) : '—'} tone="signal" />
        <Cell label="NEXT LAUNCH" value={`T- ${nextLaunchCountdown(net, now)}`} />
        <Cell
          label="MAX QUAKE 24H"
          value={strongest !== null ? `M${strongest.toFixed(1)}` : '—'}
          tone={strongest !== null ? quakeStatus(strongest) : undefined}
        />
      </div>
    </div>
  )
}
