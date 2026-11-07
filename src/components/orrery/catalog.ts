/**
 * Everything the orrery can find (#91, #93): the Sun and planets (always, from the
 * elements), then the Moon and the spacecraft from /api/orrery-bodies, grouped as the
 * controls group them (spec Part 19). A craft whose samples don't cover the date stays
 * in the list, marked: "no data for this date" is an answer, not an absence.
 */
import { PLANETS } from '@/lib/orrery/elements'
import { stateAt } from '@/lib/orrery/ephemeris'
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

export function buildCatalog(tracks: readonly OrreryTrack[], jd: number): CatalogItem[] {
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
    items.push({
      key: t.id,
      label: t.name,
      kind: t.category === 'moon' ? 'moon' : 'craft',
      group: GROUP_LABEL[t.group],
      available: stateAt(t, jd) !== null,
    })
  }
  return items
}
