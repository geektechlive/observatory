import { useQueryClient } from '@tanstack/react-query'

import { DataAge } from '@/components/ui/DataAge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Label } from '@/components/ui/Label'
import { PanelState } from '@/components/ui/PanelState'
import { Readout } from '@/components/ui/Readout'
import { useDonki } from '@/hooks/useDonki'
import { formatRelativeTime } from '@/lib/format'

import { KpSparkline } from './KpSparkline'
import styles from './space-weather-strip.module.css'

interface RecentEvent {
  id: string
  type: string
  time: string
  description: string
}

export function SpaceWeatherStrip() {
  const { data, isLoading, error } = useDonki()
  const updatedAt = useQueryClient().getQueryState(['donki'])?.dataUpdatedAt ?? 0

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="Space Weather">
        <PanelState kind="loading" />
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="Space Weather">
        <PanelState kind="unavailable" detail="NASA DONKI did not answer" />
      </GlassPanel>
    )
  }

  // Collect all Kp readings across all storms for sparkline
  const kpReadings: { observedTime: string; kpIndex: number }[] = []
  for (const storm of data.geomagneticStorms) {
    for (const kp of storm.allKpIndex ?? []) {
      kpReadings.push({ observedTime: kp.observedTime, kpIndex: kp.kpIndex })
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

  const counts: [string, number][] = [
    ['Flares', data.flares.length],
    ['CMEs', data.cmes.length],
    ['Storms', data.geomagneticStorms.length],
    ['SEPs', data.seps.length],
  ]

  return (
    <GlassPanel variant="tile" label="Space Weather">
      <DataAge updatedAt={updatedAt} />
      <div className={styles.strip ?? ''}>
        <div className={styles.countRow ?? ''}>
          {counts.map(([label, n]) => (
            <div key={label} className={styles.countChip ?? ''}>
              <Readout value={String(n)} tone="signal" className={styles.countValue ?? ''} />
              <Label>{label}</Label>
            </div>
          ))}
        </div>

        <KpSparkline readings={kpReadings} />

        <div className={styles.divider ?? ''} />

        <div className={styles.eventList ?? ''}>
          {top4.length === 0 ? (
            <PanelState kind="empty" detail="No recent space weather events" />
          ) : (
            top4.map((ev) => (
              <div key={ev.id} className={styles.eventItem ?? ''}>
                <span className={styles.eventTime ?? ''}>{formatRelativeTime(ev.time)}</span>
                <Label tone="dim">{ev.type}</Label>
                <span className={styles.eventDesc ?? ''}>{ev.description}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </GlassPanel>
  )
}
