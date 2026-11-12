import { useEffect, useMemo, useState } from 'react'

import { useCme } from '@/hooks/useCme'
import { useOrreryNeo } from '@/hooks/useOrreryNeo'
import { useSolarWind } from '@/hooks/useSolarWind'
import { approachPasses, DEFAULT_NEO_FILTER, type NeoFilter } from '@/lib/orrery/asteroids'
import type { OrreryApproach, ScoutObject } from '@/schemas/orreryNeo'

import type { NearCatalog } from './catalog'
import type { OrreryRenderer } from './three/OrreryRenderer'

const NO_APPROACHES: readonly OrreryApproach[] = []
const NO_SCOUT: readonly ScoutObject[] = []

/** The close-approach list's status line: count and age, or why there is none. */
function neoStatus(
  status: 'pending' | 'error' | 'success',
  count: number,
  ageSeconds: number | null,
  degraded: boolean,
): string {
  if (status === 'pending') return 'Loading close approaches from JPL…'
  if (status === 'error') return 'Close approaches are unavailable right now.'
  const age =
    ageSeconds === null
      ? ''
      : `, sampled ${String(Math.max(1, Math.round(ageSeconds / 3600)))} h ago`
  return `${String(count)} close approaches from JPL CAD and Horizons${age}${degraded ? ' (older than usual)' : ''}.`
}

/**
 * Earth's neighbourhood for the orrery page (#92): this fortnight's close approaches,
 * Scout's unconfirmed objects, the filters, the Sun–Earth line switch, and the solar
 * wind and CME forecast for L1. Pushes what the renderer draws; returns what the
 * controls, search and inspector show.
 */
export function useNearEarth(renderer: OrreryRenderer | null, jd: number) {
  const query = useOrreryNeo()
  const neo = query.data ?? null
  const approaches = neo?.approaches ?? NO_APPROACHES
  const scout = neo?.scout?.objects ?? NO_SCOUT
  const [filter, setFilter] = useState<NeoFilter>(DEFAULT_NEO_FILTER)
  const [sunLine, setSunLine] = useState(true)
  const wind = useSolarWind().data ?? null
  const cme = useCme().data ?? null

  useEffect(() => {
    renderer?.setApproaches(approaches)
  }, [renderer, approaches])
  useEffect(() => {
    renderer?.setNeoFilter(filter)
  }, [renderer, filter])
  useEffect(() => {
    renderer?.setSunEarthLine(sunLine)
  }, [renderer, sunLine])

  const catalog: NearCatalog = useMemo(
    () => ({ approaches, scout: scout.map((o) => o.objectName) }),
    [approaches, scout],
  )
  const shown = approaches.filter((a) => a.fine !== null && approachPasses(a, filter, jd)).length

  return {
    neo,
    approaches,
    /** The approaches have answered, or failed: an empty list now means none (#215). */
    approachesSettled: !query.isPending,
    scout,
    filter,
    setFilter,
    sunLine,
    setSunLine,
    wind: wind
      ? {
          speed: wind.windSpeed,
          density: wind.windDensity,
          bz: wind.imfBz,
          updatedAt: wind.updatedAt,
        }
      : null,
    cme: cme ? { inbound: cme.inbound, arrival: cme.arrival } : null,
    catalog,
    shown,
    status: neoStatus(query.status, approaches.length, query.dataAgeSeconds, query.degraded),
    /** The close approaches have answered or failed: a link to one can be judged (#108). */
    settled: query.status !== 'pending',
  }
}
