import { useQueryClient } from '@tanstack/react-query'
import { useLaunches } from '@/hooks/useLaunches'
import { useNow } from '@/hooks/useNow'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { DataAge } from '@/components/ui/DataAge'
import type { Launch } from '@/schemas/launches'
import styles from './launch-panel.module.css'

function formatCountdown(net: string | null, now: Date): string {
  if (!net) return 'NET TBD'
  const diff = new Date(net).getTime() - now.getTime()
  if (diff <= 0) return 'LAUNCHED'

  const totalSeconds = Math.floor(diff / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const hh = String(hours).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')

  if (days > 0) return `T- ${days}d ${hh}:${mm}:${ss}`
  return `T- ${hh}:${mm}:${ss}`
}

function formatNet(net: string | null): string {
  if (!net) return '—'
  const d = new Date(net)
  const months = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ]
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = months[d.getUTCMonth()] ?? ''
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${day} ${month} · ${hh}:${mm} UTC`
}

function statusColor(abbrev: string): string {
  const a = abbrev.toUpperCase()
  if (a === 'GO') return 'var(--green)'
  if (a === 'TBD' || a === 'TBC') return 'var(--amber)'
  if (a === 'HOLD') return 'var(--magenta)'
  return 'var(--ink-dim)'
}

function rocketName(launch: Launch): string {
  return launch.rocket?.configuration.full_name ?? launch.rocket?.configuration.name ?? launch.name
}

export function LaunchPanel() {
  const { data, isLoading, error } = useLaunches()
  const updatedAt = useQueryClient().getQueryState(['launches'])?.dataUpdatedAt ?? 0
  const now = useNow()

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="Launches">
        <div className={styles.loading ?? ''}>Loading...</div>
      </GlassPanel>
    )
  }

  if (error || !data || data.results.length === 0) {
    return (
      <GlassPanel variant="tile" label="Launches">
        <div className={styles.unavailable ?? ''}>Data unavailable</div>
      </GlassPanel>
    )
  }

  const [next, ...upcoming] = data.results
  if (!next) {
    return (
      <GlassPanel variant="tile" label="Launches">
        <div className={styles.unavailable ?? ''}>No upcoming launches</div>
      </GlassPanel>
    )
  }

  const countdown = formatCountdown(next.net, now)
  const provider = next.launch_service_provider?.name ?? ''
  const pad = next.pad?.location?.name ?? next.pad?.name ?? ''

  return (
    <GlassPanel variant="tile" label="Launches">
      <DataAge updatedAt={updatedAt} />
      <div className={styles.launchPanel ?? ''}>
        <div className={styles.nextUp ?? ''}>
          <div className={styles.nextLabel ?? ''}>NEXT UP</div>
          <div className={styles.rocketName ?? ''}>{rocketName(next)}</div>
          {provider || pad ? (
            <div className={styles.provider ?? ''}>
              {[provider, pad].filter(Boolean).join(' · ')}
            </div>
          ) : null}
          <div
            className={styles.countdown ?? ''}
            aria-live="polite"
            aria-label={`Launch countdown: ${countdown}`}
          >
            {countdown}
          </div>
          <div
            className={styles.statusBadge ?? ''}
            style={{
              color: statusColor(next.status.abbrev),
              borderColor: statusColor(next.status.abbrev),
            }}
          >
            {next.status.abbrev}
          </div>
        </div>

        {upcoming.length > 0 && (
          <>
            <div className={styles.divider ?? ''} />
            <div className={styles.upcomingList ?? ''}>
              {upcoming.slice(0, 3).map((launch) => (
                <div key={launch.id} className={styles.upcomingItem ?? ''}>
                  <span className={styles.upcomingRocket ?? ''}>{rocketName(launch)}</span>
                  <span className={styles.upcomingNet ?? ''}>{formatNet(launch.net)}</span>
                  <span
                    className={styles.upcomingStatus ?? ''}
                    style={{ color: statusColor(launch.status.abbrev) }}
                  >
                    {launch.status.abbrev}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </GlassPanel>
  )
}
