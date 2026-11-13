import { useCallback, useEffect, useMemo, useState } from 'react'

import { useCometsTonight } from '@/hooks/useCometsTonight'
import { useOrreryDwarfs } from '@/hooks/useOrreryDwarfs'
import { useOrrerySmallBodies } from '@/hooks/useOrrerySmallBodies'
import { isDwarfFocus } from '@/lib/orrery/dwarfs'
import { dwarfEntries, dwarfStatus, type OrreryEntry } from '@/lib/orrery/dwarfView'
import {
  asteroidEntries,
  asteroidStatus,
  isAsteroidKey,
  smallBodyEntries,
  smallBodyStatus,
} from '@/lib/orrery/smallBodyView'

import { type CatalogItem, smallBodyCatalog } from './catalog'
import type { OrreryRenderer, SmallBodyGroups } from './three/OrreryRenderer'

const OFF: SmallBodyGroups = { comets: false, interstellar: false, asteroids: false, dwarfs: false }
const NO_ENTRIES: OrreryEntry[] = []

export interface SmallBodiesView {
  groups: SmallBodyGroups
  setGroups: (g: SmallBodyGroups) => void
  entries: readonly OrreryEntry[]
  catalog: readonly CatalogItem[]
  status: string
  /** The "Dwarf planets" switch's own status line (#99 item 8). */
  dwarfStatus: string
  /** The "Bright asteroids" switch's status line (#99 item 4). */
  asteroidStatus: string
  /** A link asks for a focus the loaded catalog lacks: fetch what it needs, if not already. */
  request: (focus: string) => void
  /** Everything asked for has answered or failed: a link focus still unknown now is unknown. */
  settled: boolean
  /** The entry for a key, or undefined. */
  find: (key: string | null) => OrreryEntry | undefined
  /** Choosing one switches its group on, so it is drawn. */
  showGroupOf: (key: string) => void
}

/**
 * Comets, the interstellar objects, the bright asteroids and the dwarf planets on the orrery
 * page (#99): the switches (all off), the data (three endpoints, each fetched only once its
 * switch or a link asks: a visitor who wants only Pluto never downloads the comets, and the
 * reverse; the asteroids come from the small Tonight slice), the renderer's layer, and the
 * Find box's entries.
 */
export function useSmallBodies(renderer: OrreryRenderer | null, jd: number): SmallBodiesView {
  const [groups, setGroups] = useState<SmallBodyGroups>(OFF)
  const [asked, setAsked] = useState({ comets: false, asteroids: false, dwarfs: false })
  const cometsOn = asked.comets || groups.comets || groups.interstellar
  const dwarfsOn = asked.dwarfs || groups.dwarfs
  const asteroidsOn = asked.asteroids || groups.asteroids
  const comets = useOrrerySmallBodies({ enabled: cometsOn })
  const dwarfs = useOrreryDwarfs({ enabled: dwarfsOn })
  const asteroids = useCometsTonight({ enabled: asteroidsOn })
  const entries = useMemo(() => {
    if (!comets.data && !dwarfs.data && !asteroids.data) return NO_ENTRIES
    return [
      ...smallBodyEntries(comets.data),
      ...asteroidEntries(asteroids.data),
      ...dwarfEntries(dwarfs.data),
    ]
  }, [comets.data, dwarfs.data, asteroids.data])

  useEffect(() => {
    renderer?.setSmallBodies(entries)
  }, [renderer, entries])

  useEffect(() => {
    renderer?.setSmallBodyGroups(groups)
  }, [renderer, groups])

  const catalog = useMemo(() => smallBodyCatalog(entries, jd), [entries, jd])
  const status = smallBodyStatus({
    status: comets.status,
    enabled: cometsOn,
    comets: comets.data?.comets.length ?? 0,
    interstellar: comets.data?.interstellar.length ?? 0,
  })
  const dwarfLine = dwarfStatus({
    status: dwarfs.status,
    enabled: groups.dwarfs,
    count: dwarfs.data?.dwarfs.length ?? 0,
  })
  const asteroidLine = asteroidStatus({
    status: asteroids.status,
    enabled: asteroidsOn,
    count: asteroids.data ? asteroidEntries(asteroids.data).length : 0,
  })
  const request = useCallback((focus: string) => {
    const part = isDwarfFocus(focus) ? 'dwarfs' : isAsteroidKey(focus) ? 'asteroids' : 'comets'
    setAsked((a) => (a[part] ? a : { ...a, [part]: true }))
  }, [])
  const find = useCallback(
    (key: string | null) => (key === null ? undefined : entries.find((e) => e.key === key)),
    [entries],
  )
  // The renderer hears at once, not after the next render: the page focuses the object
  // straight after, and focusOn finds nothing to fly to while its group is off.
  const showGroupOf = useCallback(
    (key: string) => {
      const group = entries.find((e) => e.key === key)?.group
      if (!group || groups[group]) return
      const next = { ...groups, [group]: true }
      renderer?.setSmallBodyGroups(next)
      setGroups(next)
    },
    [entries, groups, renderer],
  )
  const settledOf = (on: boolean, status: string) => !on || status !== 'pending'
  return {
    groups,
    setGroups,
    entries,
    catalog,
    status,
    dwarfStatus: dwarfLine,
    asteroidStatus: asteroidLine,
    request,
    settled:
      (cometsOn || dwarfsOn || asteroidsOn) &&
      settledOf(cometsOn, comets.status) &&
      settledOf(asteroidsOn, asteroids.status) &&
      settledOf(dwarfsOn, dwarfs.status),
    find,
    showGroupOf,
  }
}
