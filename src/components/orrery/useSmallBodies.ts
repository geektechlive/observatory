import { useCallback, useEffect, useMemo, useState } from 'react'

import { useOrrerySmallBodies } from '@/hooks/useOrrerySmallBodies'
import { smallBodyEntries, type SmallBodyEntry, smallBodyStatus } from '@/lib/orrery/smallBodyView'

import { type CatalogItem, smallBodyCatalog } from './catalog'
import type { OrreryRenderer, SmallBodyGroups } from './three/OrreryRenderer'

const OFF: SmallBodyGroups = { comets: false, interstellar: false }
const NO_ENTRIES: SmallBodyEntry[] = []

export interface SmallBodiesView {
  groups: SmallBodyGroups
  setGroups: (g: SmallBodyGroups) => void
  entries: readonly SmallBodyEntry[]
  catalog: readonly CatalogItem[]
  status: string
  /** A link asks for a focus the loaded catalog lacks: fetch them, if not already. */
  request: () => void
  /** Asked for, and answered or failed: a link focus still unknown now is unknown. */
  settled: boolean
  /** The entry for a key, or undefined. */
  find: (key: string | null) => SmallBodyEntry | undefined
  /** Choosing one switches its group on, so it is drawn. */
  showGroupOf: (key: string) => void
}

/**
 * Comets and the interstellar objects on the orrery page (#99): the switches (both off),
 * the data (fetched only once a switch or a link asks), the renderer's layer, and the
 * Find box's entries.
 */
export function useSmallBodies(renderer: OrreryRenderer | null, jd: number): SmallBodiesView {
  const [groups, setGroups] = useState<SmallBodyGroups>(OFF)
  const [requested, setRequested] = useState(false)
  const enabled = requested || groups.comets || groups.interstellar
  const query = useOrrerySmallBodies({ enabled })
  const entries = useMemo(
    () => (query.data ? smallBodyEntries(query.data) : NO_ENTRIES),
    [query.data],
  )

  useEffect(() => {
    renderer?.setSmallBodies(entries)
  }, [renderer, entries])

  useEffect(() => {
    renderer?.setSmallBodyGroups(groups)
  }, [renderer, groups])

  const catalog = useMemo(() => smallBodyCatalog(entries, jd), [entries, jd])
  const status = smallBodyStatus({
    status: query.status,
    enabled,
    comets: query.data?.comets.length ?? 0,
    interstellar: query.data?.interstellar.length ?? 0,
  })
  const request = useCallback(() => {
    setRequested(true)
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
  return {
    groups,
    setGroups,
    entries,
    catalog,
    status,
    request,
    settled: enabled && query.status !== 'pending',
    find,
    showGroupOf,
  }
}
