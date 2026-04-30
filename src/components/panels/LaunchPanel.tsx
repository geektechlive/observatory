import { useQueryClient } from '@tanstack/react-query'
import { useLaunches } from '@/hooks/useLaunches'
import { useNow } from '@/hooks/useNow'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { DataAge } from '@/components/ui/DataAge'
import type { RLLLaunch } from '@/schemas/launches'
import styles from './launch-panel.module.css'

function launchTime(launch: RLLLaunch): string | null {
  return launch.t0 ?? launch.win_open ?? null
}

function launchStatus(launch: RLLLaunch): { abbrev: string; color: string } {
  if (launch.t0) return { abbrev: 'GO', color: 'var(--green)' }
  if (launch.win_open) return { abbrev: 'TBC', color: 'var(--amber)' }
  return { abbrev: 'TBD', color: 'var(--ink-dim)' }
}

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

function formatNet(launch: RLLLaunch): string {
  const net = launchTime(launch)
  if (!net) return launch.date_str ?? '—'
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

function rocketName(launch: RLLLaunch): string {
  return launch.vehicle?.name ?? launch.name
}

function launchLocation(launch: RLLLaunch): string {
  const parts = [launch.pad?.name, launch.pad?.location?.state ?? launch.pad?.location?.country]
  return parts.filter(Boolean).join(', ')
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

  if (error || !data || data.result.length === 0) {
    return (
      <GlassPanel variant="tile" label="Launches">
        <div className={styles.unavailable ?? ''}>Data unavailable</div>
      </GlassPanel>
    )
  }

  const [next, ...upcoming] = data.result
  if (!next) {
    return (
      <GlassPanel variant="tile" label="Launches">
        <div className={styles.unavailable ?? ''}>No upcoming launches</div>
      </GlassPanel>
    )
  }

  const net = launchTime(next)
  const countdown = formatCountdown(net, now)
  const status = launchStatus(next)
  const provider = next.provider?.name ?? ''
  const location = launchLocation(next)

  return (
    <GlassPanel variant="tile" label="Launches">
      <DataAge updatedAt={updatedAt} />
      <div className={styles.launchPanel ?? ''}>
        <div className={styles.nextUp ?? ''}>
          <div className={styles.nextLabel ?? ''}>NEXT UP</div>
          <div className={styles.rocketName ?? ''}>{rocketName(next)}</div>
          {provider || location ? (
            <div className={styles.provider ?? ''}>
              {[provider, location].filter(Boolean).join(' · ')}
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
            style={{ color: status.color, borderColor: status.color }}
          >
            {status.abbrev}
          </div>
        </div>

        {upcoming.length > 0 && (
          <>
            <div className={styles.divider ?? ''} />
            <div className={styles.upcomingList ?? ''}>
              {upcoming.slice(0, 3).map((launch) => {
                const s = launchStatus(launch)
                return (
                  <div key={launch.id} className={styles.upcomingItem ?? ''}>
                    <span className={styles.upcomingRocket ?? ''}>{rocketName(launch)}</span>
                    <span className={styles.upcomingNet ?? ''}>{formatNet(launch)}</span>
                    <span className={styles.upcomingStatus ?? ''} style={{ color: s.color }}>
                      {s.abbrev}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </GlassPanel>
  )
}
