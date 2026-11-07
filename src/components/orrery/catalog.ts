/**
 * Everything the orrery can find (#91, #93): the Sun and planets (always, from the
 * elements), then the Moon and the spacecraft from /api/orrery-bodies, grouped as the
 * controls group them (spec Part 19). A craft whose samples don't cover the date stays
 * in the list, marked: "no data for this date" is an answer, not an absence.
 */
import { shortName } from '@/lib/orrery/asteroids'
import { PLANETS } from '@/lib/orrery/elements'
import { stateAt } from '@/lib/orrery/ephemeris'
import type { MoonBody } from '@/lib/orrery/moonState'
import { ISS_NORAD_ID, satKey } from '@/lib/orrery/satView'
import type { OrreryTrack, SampledSpan } from '@/schemas/orreryBodies'

/** 'lookup': an object looked up at JPL and shown (#145). */
export type CatalogKind =
  'star' | 'planet' | 'moon' | 'craft' | 'asteroid' | 'scout' | 'marker' | 'satellite' | 'lookup'

export interface CatalogItem {
  /** A planet's name, or a namespaced id for the Moon and craft (`naif:-31`). */
  key: string
  label: string
  kind: CatalogKind
  /** The group heading it sits under. */
  group: string
  /** Data covers the date. Planets always do. */
  available: boolean
  /** Said instead of "no data for this date" (Scout's objects never have a position). */
  note?: string
}

/** The L1 marker's key in the scene, search and the inspector (#92). */
export const L1_KEY = 'L1'

/** What search needs from /api/orrery-neo (#92). */
export interface NearCatalog {
  approaches: readonly { id: string; name: string; fine: SampledSpan | null }[]
  /** Scout's temporary designations. */
  scout: readonly string[]
}

const GROUP_LABEL: Record<OrreryTrack['group'], string> = {
  'deep-space': 'Deep space',
  mission: 'Missions',
  l1: 'L1 & L2 observatories',
  planet: 'Solar system',
  moon: 'Moons',
}

/**
 * The stage's line for craft and moons hidden because no sample covers the date (#114:
 * at a year a second they leave their data spans within seconds). Null when none are.
 * An item with a `note` never had a position for any date, so it isn't counted (#149).
 */
export function noDataNotice(items: readonly CatalogItem[]): string | null {
  const missing = items.filter(
    (i) =>
      !i.available &&
      i.note === undefined &&
      (i.kind === 'craft' || i.kind === 'moon' || i.kind === 'asteroid'),
  )
  const tail = 'Positions are never extrapolated.'
  const only = missing[0]
  if (!only) return null
  if (missing.length === 1) return `${only.label} has no data for this date and is hidden. ${tail}`
  const count = (kind: CatalogKind) => missing.filter((i) => i.kind === kind).length
  const craft = count('craft')
  const moons = count('moon')
  const rocks = count('asteroid')
  const parts = [
    craft > 0 ? `${String(craft)} spacecraft` : '',
    moons > 0 ? `${String(moons)} ${moons === 1 ? 'moon' : 'moons'}` : '',
    rocks > 0 ? `${String(rocks)} ${rocks === 1 ? 'close approach' : 'close approaches'}` : '',
  ].filter(Boolean)
  const list =
    parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1) ?? ''}` : parts[0]
  return `${list ?? ''} have no data for this date and are hidden. ${tail}`
}

export function buildCatalog(
  tracks: readonly OrreryTrack[],
  jd: number,
  /** Drawn moons (#107); Earth's Moon among them replaces its plain track entry. */
  moons: readonly MoonBody[] = [],
  /** Close approaches and Scout's objects (#92). */
  near?: NearCatalog,
  /** The loaded space stations (#98); the ISS is listed even before they load. */
  stations: readonly { key: string; name: string }[] = [],
): CatalogItem[] {
  const moonKeys = new Set(moons.map((m) => m.key))
  const items: CatalogItem[] = [
    { key: 'Sun', label: 'Sun', kind: 'star', group: 'Solar system', available: true },
    ...PLANETS.map((p) => ({
      key: p,
      label: p,
      kind: 'planet' as const,
      group: 'Solar system',
      available: true,
    })),
  ]
  for (const t of tracks) {
    if (t.category === 'planet') continue // Earth: already listed, drawn from both sources
    if (moonKeys.has(t.id)) continue // listed below with the other moons
    items.push({
      key: t.id,
      label: t.name,
      kind: t.category === 'moon' ? 'moon' : 'craft',
      group: GROUP_LABEL[t.group],
      available: stateAt(t, jd) !== null,
    })
  }
  for (const m of moons) {
    items.push({
      key: m.key,
      label: m.name,
      kind: 'moon',
      group: GROUP_LABEL.moon,
      available: m.relative(jd) !== null,
    })
  }
  // Choosing a station opens the Earth orbit view, where its group loads (#98). Only the
  // stations are listed: search over 19,000 satellites would bury everything else.
  const iss = satKey(ISS_NORAD_ID)
  const listed = stations.length > 0 ? stations : [{ key: iss, name: 'ISS' }]
  for (const s of [...listed].sort((a, b) => Number(b.key === iss) - Number(a.key === iss))) {
    items.push({
      key: s.key,
      label: s.name,
      kind: 'satellite',
      group: 'Space stations',
      available: true,
    })
  }
  if (!near) return items
  items.push({ key: L1_KEY, label: 'L1', kind: 'marker', group: 'Space weather', available: true })
  for (const a of near.approaches) {
    const base = {
      key: a.id,
      label: shortName(a.name),
      kind: 'asteroid',
      group: 'Close approaches',
    } as const
    // In CAD before Horizons knows it (#149: 2026 VO5): no samples for any date.
    if (a.fine === null) {
      items.push({ ...base, available: false, note: 'no position from JPL Horizons yet' })
      continue
    }
    items.push({ ...base, available: stateAt({ fine: a.fine, coarse: null }, jd) !== null })
  }
  for (const name of near.scout) {
    items.push({
      key: `scout:${name}`,
      label: name,
      kind: 'scout',
      group: 'Just found (JPL Scout)',
      available: false,
      note: 'no position (unconfirmed)',
    })
  }
  return items
}
