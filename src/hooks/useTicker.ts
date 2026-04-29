import { useMemo } from 'react'
import { useEvents } from '@/hooks/useEvents'
import { useDonki } from '@/hooks/useDonki'
import { useSentry } from '@/hooks/useSentry'
import { useFireball } from '@/hooks/useFireball'
import { formatKt, formatPalermo, formatRelativeTime } from '@/lib/format'

export interface TickerItem {
  id: string
  type: string
  label: string
  description: string
  color: string
  time: Date
}

const EONET_CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  wildfires: { label: 'WILDFIRE', color: 'var(--warm)' },
  severeStorms: { label: 'STORM', color: 'var(--amber)' },
  earthquakes: { label: 'EARTHQUAKE', color: 'var(--cyan)' },
  volcanoes: { label: 'VOLCANO', color: 'var(--orange)' },
  floods: { label: 'FLOOD', color: 'var(--cyan)' },
}

const DEFAULT_EVENT_META = { label: 'EVENT', color: 'var(--ink-dim)' }

export function useTicker(): TickerItem[] {
  const eventsQuery = useEvents()
  const { data: donki } = useDonki()
  const { data: sentry } = useSentry()
  const { data: fireball } = useFireball()

  return useMemo<TickerItem[]>(() => {
    const items: TickerItem[] = []

    // EONET events: newest 10 open events
    const events = eventsQuery.data?.events ?? []
    events
      .filter((e) => !e.closed)
      .slice(0, 10)
      .forEach((e) => {
        const categoryId = e.categories[0]?.id ?? ''
        const meta = EONET_CATEGORY_MAP[categoryId] ?? DEFAULT_EVENT_META
        const latestGeom = e.geometry[e.geometry.length - 1]
        const timeStr = latestGeom?.date ?? ''
        items.push({
          id: `eonet-${e.id}`,
          type: categoryId || 'event',
          label: meta.label,
          description: e.title,
          color: meta.color,
          time: timeStr ? new Date(timeStr) : new Date(0),
        })
      })

    // DONKI flares: newest 5
    const flares = donki?.flares ?? []
    flares.slice(0, 5).forEach((f) => {
      const cls = f.classType ? `Class ${f.classType}` : 'Solar flare'
      items.push({
        id: `flare-${f.flrID}`,
        type: 'flare',
        label: 'SOLAR FLARE',
        description: cls,
        color: 'var(--amber)',
        time: new Date(f.beginTime),
      })
    })

    // DONKI CMEs: newest 3
    const cmes = donki?.cmes ?? []
    cmes.slice(0, 3).forEach((c) => {
      const desc = c.speed != null ? `${c.speed.toFixed(0)} km/s` : 'CME detected'
      items.push({
        id: `cme-${c.activityID}`,
        type: 'cme',
        label: 'CME',
        description: desc,
        color: 'var(--amber)',
        time: new Date(c.startTime),
      })
    })

    // Sentry: top 3 by ps_cum descending
    const sentryData = sentry?.data ?? []
    const topSentry = [...sentryData]
      .sort((a, b) => {
        const aPs = parseFloat(a.ps_cum ?? '') || -Infinity
        const bPs = parseFloat(b.ps_cum ?? '') || -Infinity
        return bPs - aPs
      })
      .slice(0, 3)
    topSentry.forEach((s) => {
      const ps = formatPalermo(s.ps_cum)
      items.push({
        id: `sentry-${s.des}`,
        type: 'sentry',
        label: 'IMPACT RISK',
        description: `${s.fullname ?? s.name ?? s.des} · Palermo ${ps}`,
        color: 'var(--magenta)',
        time: new Date(0),
      })
    })

    // Fireball: newest 3
    const fireballs = fireball?.data ?? []
    fireballs.slice(0, 3).forEach((fb) => {
      const energy = formatKt(fb.impactE)
      const rel = formatRelativeTime(fb.date)
      items.push({
        id: `fireball-${fb.date}`,
        type: 'fireball',
        label: 'FIREBALL',
        description: `${energy} · ${rel}`,
        color: 'var(--gold)',
        time: new Date(fb.date),
      })
    })

    // Merge: sort by time descending, take first 30
    return items.sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 30)
  }, [eventsQuery.data, donki, sentry, fireball])
}
