/**
 * The satellite browser's lists, sorts and filter (#158), the rules that need no React or
 * three.js. They run over what the worker sent once per load (names, NORAD ids, groups,
 * orbit class, launch order), plus Space-Track's SATCAT rows and TIP predictions when the
 * browser has them. Imports types only, so it costs the first load nothing.
 *
 * Built for a keystroke: `buildBrowseIndex` lowercases the names once per field version,
 * and `browse` is one pass over the objects, then a sort of what matched.
 */
import type { OrbitClassCode } from '@/lib/orbit/orbitClass'
import { REENTRY_GROUP, type SatFieldGroup, type SatGroupId } from '@/lib/orbit/satCatalog'

import { satKey } from './satView'

/** The rows shown at most; the rest are counted ("N more, narrow it"). */
export const DEFAULT_BROWSE_LIMIT = 100

export interface BrowseField {
  version: number
  groups: readonly { group: SatFieldGroup; start: number; count: number }[]
  ids: readonly string[]
  names: readonly string[]
  orbit: Uint8Array
  launch: Int32Array
}

export interface BrowseIndex {
  field: BrowseField
  /** Lowercased names, built once per field version. */
  lower: readonly string[]
  groupOf: readonly SatFieldGroup[]
}

export function buildBrowseIndex(field: BrowseField): BrowseIndex {
  const groupOf: SatFieldGroup[] = new Array<SatFieldGroup>(field.ids.length)
  for (const span of field.groups) {
    for (let i = span.start; i < span.start + span.count; i += 1) groupOf[i] = span.group
  }
  return { field, lower: field.names.map((n) => n.toLowerCase()), groupOf }
}

/** What the browser keeps of a SATCAT row. */
export type SatcatLite = ReadonlyMap<string, { country: string; rcs: string }>

export type BrowseList =
  | { list: 'all' }
  | { list: 'group'; groups: readonly SatGroupId[] }
  | { list: 'orbit'; orbit: OrbitClassCode }
  | { list: 'newest' }
  | { list: 'radar' }
  | { list: 'owner'; country: string }
  | { list: 'reentry' }

export interface BrowseQuery {
  list: BrowseList
  /** A name or NORAD id, any case. */
  text: string
  satcat?: SatcatLite | undefined
  /** Space-Track's predicted re-entries by NORAD id (the 'reentry' list). */
  reentries?: ReadonlyMap<string, { decayMs: number }> | undefined
  /** Names Space-Track gave the objects it lists, for those the orrery does not carry. */
  reentryNames?: Readonly<Record<string, string>> | undefined
  /**
   * Every stored group is switched on and loaded. Only then can an object missing from the
   * field be said to be in no group; until then it may be in one that is off.
   */
  allGroupsLoaded?: boolean | undefined
  limit?: number
}

export interface BrowseRow {
  /** Position in the field, or -1 for a predicted re-entry the orrery does not carry. */
  index: number
  key: string
  id: string
  name: string
  group: SatFieldGroup | null
  /** In a group the orrery carries, so it can be shown. */
  drawn: boolean
  /** For a row that is not drawn: it may be in a group that is off, or is in none. */
  notDrawnReason?: 'groups-off' | 'no-group'
  decayMs?: number
}

export interface BrowseResult {
  rows: BrowseRow[]
  /** Matches before the cap. */
  total: number
}

const RCS_RANK: Readonly<Record<string, number>> = { LARGE: 3, MEDIUM: 2, SMALL: 1 }
const rcsRank = (size: string | undefined) => RCS_RANK[(size ?? '').toUpperCase()] ?? 0

function matchesText(index: BrowseIndex, i: number, needle: string, idPrefix: boolean): boolean {
  if (needle === '') return true
  if ((index.lower[i] ?? '').includes(needle)) return true
  return idPrefix && (index.field.ids[i] ?? '').startsWith(needle)
}

function included(index: BrowseIndex, i: number, q: BrowseQuery): boolean {
  const l = q.list
  switch (l.list) {
    case 'all':
    case 'newest':
      return true
    case 'group': {
      const g = index.groupOf[i]
      return g !== undefined && g !== REENTRY_GROUP && l.groups.includes(g)
    }
    case 'orbit':
      return index.field.orbit[i] === l.orbit
    case 'radar':
      return rcsRank(q.satcat?.get(index.field.ids[i] ?? '')?.rcs) > 0
    case 'owner':
      return q.satcat?.get(index.field.ids[i] ?? '')?.country === l.country
    case 'reentry':
      return q.reentries?.has(index.field.ids[i] ?? '') ?? false
  }
}

function rowAt(index: BrowseIndex, i: number): BrowseRow {
  const id = index.field.ids[i] ?? ''
  return {
    index: i,
    key: satKey(id),
    id,
    name: index.field.names[i] ?? id,
    group: index.groupOf[i] ?? null,
    drawn: true,
  }
}

const byName = (a: BrowseRow, b: BrowseRow) => a.name.localeCompare(b.name)

function sortRows(rows: BrowseRow[], index: BrowseIndex, q: BrowseQuery): void {
  switch (q.list.list) {
    case 'newest':
      rows.sort(
        (a, b) =>
          (index.field.launch[b.index] ?? 0) - (index.field.launch[a.index] ?? 0) || byName(a, b),
      )
      return
    case 'radar':
      rows.sort(
        (a, b) =>
          rcsRank(q.satcat?.get(b.id)?.rcs) - rcsRank(q.satcat?.get(a.id)?.rcs) || byName(a, b),
      )
      return
    case 'reentry':
      rows.sort((a, b) => (a.decayMs ?? 0) - (b.decayMs ?? 0))
      return
    default:
      return
  }
}

/** The objects a list and a text filter match, capped, with how many matched. */
export function browse(index: BrowseIndex, q: BrowseQuery): BrowseResult {
  const needle = q.text.trim().toLowerCase()
  const idPrefix = /^\d+$/.test(needle)
  const limit = q.limit ?? DEFAULT_BROWSE_LIMIT
  const rows: BrowseRow[] = []
  const n = index.field.ids.length
  for (let i = 0; i < n; i += 1) {
    if (!included(index, i, q) || !matchesText(index, i, needle, idPrefix)) continue
    const row = rowAt(index, i)
    if (q.list.list === 'reentry') row.decayMs = q.reentries?.get(row.id)?.decayMs ?? 0
    rows.push(row)
  }
  if (q.list.list === 'reentry') addUndrawn(rows, index, q, needle, idPrefix)
  sortRows(rows, index, q)
  return { rows: rows.slice(0, limit), total: rows.length }
}

/**
 * Predicted re-entries of objects not in the field: in a group that is off or not yet
 * loaded, or in none (a rocket stage). The row says which only when it can know.
 */
function addUndrawn(
  rows: BrowseRow[],
  index: BrowseIndex,
  q: BrowseQuery,
  needle: string,
  idPrefix: boolean,
): void {
  if (!q.reentries) return
  const have = new Set(index.field.ids)
  for (const [id, { decayMs }] of q.reentries) {
    if (have.has(id)) continue
    const name = q.reentryNames?.[id] ?? `NORAD ${id}`
    const hit =
      needle === '' || name.toLowerCase().includes(needle) || (idPrefix && id.startsWith(needle))
    if (!hit) continue
    rows.push({
      index: -1,
      key: satKey(id),
      id,
      name,
      group: null,
      drawn: false,
      notDrawnReason: q.allGroupsLoaded === true ? 'no-group' : 'groups-off',
      decayMs,
    })
  }
}

/** Owners among the loaded satellites, most objects first. */
export function countryOptions(
  index: BrowseIndex,
  satcat: SatcatLite,
): { code: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const id of index.field.ids) {
    const country = satcat.get(id)?.country
    if (country) counts.set(country, (counts.get(country) ?? 0) + 1)
  }
  return [...counts]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
}

/** Objects per group, for the groups that have any. */
export function groupCounts(
  field: Pick<BrowseField, 'groups'>,
): Partial<Record<SatFieldGroup, number>> {
  const out: Partial<Record<SatFieldGroup, number>> = {}
  for (const span of field.groups) {
    if (span.count > 0) out[span.group] = (out[span.group] ?? 0) + span.count
  }
  return out
}
