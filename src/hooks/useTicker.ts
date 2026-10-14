import { useMemo } from 'react'

import { useDonki } from '@/hooks/useDonki'
import { useEvents } from '@/hooks/useEvents'
import { useFireball } from '@/hooks/useFireball'
import { useSentry } from '@/hooks/useSentry'
import { formatKt, formatPalermo, formatRelativeTime } from '@/lib/format'
import { EONET_KINDS, eonetKind, LANES } from '@/lib/palette'
import { flareStatus, palermoStatus, statusVar } from '@/lib/severity'

export interface TickerItem {
  id: string
  type: string
  label: string
  description: string
  color: string
  time: Date
}

const DEFAULT_EVENT_META = { label: 'EVENT', color: 'var(--bone-dim)' }

/** EONET label and lane colour come from palette.ts, the same source as the globe and map. */
function eonetMeta(categoryId: string): { label: string; color: string } {
  if (!(categoryId in EONET_KINDS)) return DEFAULT_EVENT_META
  const kind = eonetKind(categoryId)
  return { label: kind.label.toUpperCase(), color: LANES[kind.lane].emit }
}

/** Palermo as a number; missing or unparseable sorts last. 0 is a real (serious) value. */
function palermoOf(raw: string | null | undefined): number {
  const ps = parseFloat(raw ?? '')
  return Number.isNaN(ps) ? -Infinity : ps
}

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
        const meta = eonetMeta(categoryId)
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
        color: statusVar(flareStatus(f.classType ?? null)),
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
        const aPs = palermoOf(a.ps_cum)
        const bPs = palermoOf(b.ps_cum)
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
        color: statusVar(palermoStatus(palermoOf(s.ps_cum))),
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
        color: LANES.space.emit,
        time: new Date(fb.date),
      })
    })

    // Merge: sort by time descending, take first 30
    return items.sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 30)
  }, [eventsQuery.data, donki, sentry, fireball])
}
