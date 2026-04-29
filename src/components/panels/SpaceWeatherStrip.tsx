import { useDonki } from '@/hooks/useDonki'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { formatRelativeTime } from '@/lib/format'
import styles from './space-weather-strip.module.css'

interface RecentEvent {
  id: string
  type: string
  time: string
  description: string
}

export function SpaceWeatherStrip() {
  const { data, isLoading, error } = useDonki()

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="Space Weather">
        <div className={styles.loading ?? ''}>Loading...</div>
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="Space Weather">
        <div className={styles.unavailable ?? ''}>Data unavailable</div>
      </GlassPanel>
    )
  }

  // Max KP index across all storms
  let maxKp: number | null = null
  for (const storm of data.geomagneticStorms) {
    for (const kp of storm.allKpIndex ?? []) {
      if (maxKp === null || kp.kpIndex > maxKp) {
        maxKp = kp.kpIndex
      }
    }
  }

  // Most recent 4 events across all types
  const recentEvents: RecentEvent[] = []

  for (const f of data.flares) {
    const cls = f.classType ? `Class ${f.classType}` : 'Solar flare'
    const loc = f.sourceLocation ? ` · ${f.sourceLocation}` : ''
    recentEvents.push({
      id: `flare-${f.flrID}`,
      type: 'Flare',
      time: f.beginTime,
      description: cls + loc,
    })
  }
  for (const c of data.cmes) {
    const speed = c.speed != null ? ` · ${c.speed.toFixed(0)} km/s` : ''
    recentEvents.push({
      id: `cme-${c.activityID}`,
      type: 'CME',
      time: c.startTime,
      description: (c.type ?? 'CME') + speed,
    })
  }
  for (const g of data.geomagneticStorms) {
    const kp = g.allKpIndex?.[0]
    const desc = kp != null ? `KP ${kp.kpIndex}` : 'Geomagnetic storm'
    recentEvents.push({
      id: `geo-${g.gstID}`,
      type: 'Geo Storm',
      time: g.startTime,
      description: desc,
    })
  }
  for (const s of data.seps) {
    recentEvents.push({
      id: `sep-${s.sepID}`,
      type: 'SEP',
      time: s.eventTime,
      description: s.instruments?.[0]?.displayName ?? 'Particle event',
    })
  }

  const top4 = recentEvents
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 4)

  return (
    <GlassPanel variant="tile" label="Space Weather">
      <div className={styles.strip ?? ''}>
        <div className={styles.countRow ?? ''}>
          <div className={styles.countChip ?? ''}>
            <span className={styles.countValue ?? ''}>{data.flares.length}</span>
            <span className={styles.countLabel ?? ''}>Flares</span>
          </div>
          <div className={styles.countChip ?? ''}>
            <span className={styles.countValue ?? ''}>{data.cmes.length}</span>
            <span className={styles.countLabel ?? ''}>CMEs</span>
          </div>
          <div className={styles.countChip ?? ''}>
            <span className={styles.countValue ?? ''}>{data.geomagneticStorms.length}</span>
            <span className={styles.countLabel ?? ''}>Storms</span>
          </div>
          <div className={styles.countChip ?? ''}>
            <span className={styles.countValue ?? ''}>{data.seps.length}</span>
            <span className={styles.countLabel ?? ''}>SEPs</span>
          </div>
        </div>

        {maxKp !== null && <div className={styles.kpBadge ?? ''}>Max KP: {maxKp}</div>}

        <div className={styles.divider ?? ''} />

        <div className={styles.eventList ?? ''}>
          {top4.length === 0 ? (
            <span className={styles.eventDesc ?? ''}>No recent events</span>
          ) : (
            top4.map((ev) => (
              <div key={ev.id} className={styles.eventItem ?? ''}>
                <span className={styles.eventTime ?? ''}>{formatRelativeTime(ev.time)}</span>
                <span className={styles.eventType ?? ''}>{ev.type}</span>
                <span className={styles.eventDesc ?? ''}>{ev.description}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </GlassPanel>
  )
}
