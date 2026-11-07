/**
 * Everything the orrery can find (#91, #93): the Sun and planets (always, from the
 * elements), then the Moon and the spacecraft from /api/orrery-bodies, grouped as the
 * controls group them (spec Part 19). A craft whose samples don't cover the date stays
 * in the list, marked: "no data for this date" is an answer, not an absence.
 */
import { PLANETS } from '@/lib/orrery/elements'
import { stateAt } from '@/lib/orrery/ephemeris'
import type { MoonBody } from '@/lib/orrery/moonState'
import type { OrreryTrack } from '@/schemas/orreryBodies'

export type CatalogKind = 'star' | 'planet' | 'moon' | 'craft'

export interface CatalogItem {
  /** A planet's name, or a namespaced id for the Moon and craft (`naif:-31`). */
  key: string
  label: string
  kind: CatalogKind
  /** The group heading it sits under. */
  group: string
  /** Data covers the date. Planets always do. */
  available: boolean
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
 */
export function noDataNotice(items: readonly CatalogItem[]): string | null {
  const missing = items.filter((i) => !i.available && (i.kind === 'craft' || i.kind === 'moon'))
  const tail = 'Positions are never extrapolated.'
  const only = missing[0]
  if (!only) return null
  if (missing.length === 1) return `${only.label} has no data for this date and is hidden. ${tail}`
  const craft = missing.filter((i) => i.kind === 'craft').length
  const moons = missing.length - craft
  const parts = [
    craft > 0 ? `${String(craft)} spacecraft` : '',
    moons > 0 ? `${String(moons)} ${moons === 1 ? 'moon' : 'moons'}` : '',
  ].filter(Boolean)
  return `${parts.join(' and ')} have no data for this date and are hidden. ${tail}`
}

export function buildCatalog(
  tracks: readonly OrreryTrack[],
  jd: number,
  /** Drawn moons (#107); Earth's Moon among them replaces its plain track entry. */
  moons: readonly MoonBody[] = [],
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
  return items
}
