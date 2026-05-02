import { useState } from 'react'
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

function formatDate(launch: RLLLaunch): string {
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

function headerMeta(launch: RLLLaunch): string {
  const provider = launch.provider?.name ?? ''
  const pad = launch.pad?.name ?? ''
  const loc =
    launch.pad?.location?.state ??
    launch.pad?.location?.statename ??
    launch.pad?.location?.country ??
    ''
  return [provider, pad, loc].filter(Boolean).join(' · ')
}

function launchUrl(launch: RLLLaunch): string | null {
  if (!launch.slug) return null
  return `https://rocketlaunch.live/launch/${launch.slug}`
}

function weatherSummary(launch: RLLLaunch): string | null {
  const cond = launch.weather_condition
  if (!cond) return null
  const temp = launch.weather_temp ? `${Math.round(parseFloat(launch.weather_temp))}°F` : null
  const wind = launch.weather_wind_mph
    ? `${Math.round(parseFloat(launch.weather_wind_mph))} mph wind`
    : null
  return [cond, temp, wind].filter(Boolean).join(' · ')
}

export function LaunchPanel() {
  const { data, isLoading, error } = useLaunches()
  const updatedAt = useQueryClient().getQueryState(['launches'])?.dataUpdatedAt ?? 0
  const now = useNow()
  const [expandedId, setExpandedId] = useState<number | null | 'unset'>('unset')

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

  const launches = data.result
  const firstId = launches[0]?.id ?? null
  const effectiveId = expandedId === 'unset' ? firstId : expandedId

  function toggle(id: number) {
    setExpandedId((prev) => {
      const current = prev === 'unset' ? firstId : prev
      return current === id ? null : id
    })
  }

  return (
    <GlassPanel variant="tile" label="Launches">
      <DataAge updatedAt={updatedAt} />
      <div className={styles.accordion ?? ''}>
        {launches.map((launch, idx) => {
          const isOpen = effectiveId === launch.id
          const net = launchTime(launch)
          const status = launchStatus(launch)
          const countdown = formatCountdown(net, now)
          const url = launchUrl(launch)
          const meta = headerMeta(launch)
          const weather = weatherSummary(launch)
          const tags = launch.tags ?? []
          const vehicle = launch.vehicle?.name ?? launch.name

          return (
            <div
              key={launch.id}
              className={`${styles.accordionItem ?? ''} ${isOpen ? (styles.open ?? '') : ''} ${idx === 0 ? (styles.first ?? '') : ''}`}
            >
              <button
                type="button"
                className={styles.accordionHeader ?? ''}
                onClick={() => toggle(launch.id)}
                aria-expanded={isOpen}
                aria-label={`${vehicle}, ${isOpen ? 'collapse' : 'expand'} launch details`}
              >
                <span
                  className={styles.statusDot ?? ''}
                  style={{ background: status.color }}
                  aria-hidden="true"
                />
                <span className={styles.headerVehicle ?? ''}>{vehicle}</span>
                <span className={styles.headerMeta ?? ''}>{meta}</span>
                <span className={styles.headerDate ?? ''}>{formatDate(launch)}</span>
                <span className={styles.chevron ?? ''} aria-hidden="true">
                  {isOpen ? '▲' : '▼'}
                </span>
              </button>

              {isOpen && (
                <div className={styles.accordionBody ?? ''}>
                  {launch.launch_description && (
                    <p className={styles.bodyDesc ?? ''}>{launch.launch_description}</p>
                  )}

                  {(weather !== null || tags.length > 0) && (
                    <div className={styles.bodyChips ?? ''}>
                      {weather !== null && (
                        <span className={styles.weatherChip ?? ''}>{weather}</span>
                      )}
                      {tags.map((tag) => (
                        <span key={tag.id} className={styles.tagChip ?? ''}>
                          {tag.text}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className={styles.bodyFooter ?? ''}>
                    <span
                      className={styles.countdown ?? ''}
                      aria-live="polite"
                      aria-label={`Launch countdown: ${countdown}`}
                    >
                      {countdown}
                    </span>
                    <span
                      className={styles.statusBadge ?? ''}
                      style={{ color: status.color, borderColor: status.color }}
                    >
                      {status.abbrev}
                    </span>
                    {url !== null && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.launchLink ?? ''}
                      >
                        rocketlaunch.live →
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </GlassPanel>
  )
}
