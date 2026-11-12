/**
 * Which stand-in model a satellite with no model of its own gets (#194, tier C): a family
 * slug that `SATELLITE_MODELS_BY_FAMILY` (modelDescriptor.ts) is keyed by.
 *
 * The catalogue rows carry no payload type or size class (`SAT_FIELDS`), so the CubeSat
 * fleets are told by name: CelesTrak's active group names Planet's satellites `FLOCK 4A-1`
 * and Spire's `LEMUR-2-WILSON` (read 2026-11-12: 109 and 95 objects). Keep the patterns
 * tight; a loose match would label an ordinary satellite a CubeSat.
 *
 * Which groups get the generic bus is a decision: docs/decisions/0028-stand-in-models-by-name-and-group.md.
 *
 * No three.js and no catalogue code here: a type import only.
 */
import type { SatGroupId } from '@/lib/orbit/satCatalog'

export type SatFamily = 'cubesat' | 'generic-bus'

/** Planet's Flock and Spire's Lemur, by name. */
const CUBESAT_NAME = /^(?:FLOCK |LEMUR-)/

/**
 * Groups whose objects get the generic bus: active spacecraft with no better picture.
 * Not in it: the debris groups (a dot is the honest picture of a fragment), `stations`
 * (a small bus is wrong for a space station), and `starlink` (its flat-panel shape needs
 * its own model, which is not built yet).
 */
const BUS_GROUPS: ReadonlySet<SatGroupId> = new Set(['gps-ops', 'weather', 'science', 'other'])

/** A satellite's stand-in family by name and group, or null when it gets none. */
export function satFamily(name: string, group: SatGroupId | undefined): SatFamily | null {
  if (group === undefined || !BUS_GROUPS.has(group)) return null
  return CUBESAT_NAME.test(name) ? 'cubesat' : 'generic-bus'
}
