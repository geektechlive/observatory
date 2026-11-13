/**
 * The elements of the objects Space-Track predicts will re-enter (#154), as the orrery
 * takes them from the catalogue. The first-load schema keeps `tip.elements` as `unknown`
 * so the ticker's bundle does not grow (ADR 0007); the rows are checked here, in the
 * orrery chunk, and only those of the objects listed (the same ones that are ringed).
 */
import { isSatRow, type SatRow } from '@/lib/orbit/satCatalog'
import { reentryWhen } from '@/lib/spaceTrackText'
import type { Reentry } from '@/schemas/spaceTrack'

/** The rows that are well formed and belong to one of `listedIds`, one per object. */
export function reentryElementRows(elements: unknown, listedIds: ReadonlySet<string>): SatRow[] {
  if (!Array.isArray(elements)) return []
  const byId = new Map<string, SatRow>()
  for (const row of elements as unknown[]) {
    if (isSatRow(row) && listedIds.has(row[1])) byId.set(row[1], row)
  }
  return [...byId.values()]
}

/**
 * A re-entry's time and window in few characters, for a label on the stage:
 * "11 Nov 20:32 UTC ±13 h". Derived from `reentryWhen`, and kept here, in the orrery
 * chunk, so the first load (the ticker) does not carry a second formatter.
 */
export function reentryBrief(r: Reentry): string {
  return reentryWhen(r).replace(', give or take ', ' ±')
}
