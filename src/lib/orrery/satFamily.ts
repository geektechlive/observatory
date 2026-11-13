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
import type { SatFieldGroup } from '@/lib/orbit/satCatalog'

export type SatFamily = 'cubesat' | 'generic-bus'

/** Planet's Flock and Spire's Lemur, by name. */
const CUBESAT_NAME = /^(?:FLOCK |LEMUR-)/

/**
 * Groups whose objects get the generic bus: active spacecraft with no better picture.
 * Not in it: the debris groups (a dot is the honest picture of a fragment), `stations`
 * (a small bus is wrong for a space station), and `starlink` (its flat-panel shape needs
 * its own model, which is not built yet).
 */
const BUS_GROUPS: ReadonlySet<SatFieldGroup> = new Set(['gps-ops', 'weather', 'science', 'other'])

/**
 * Passive spheres and laser reflectors in those groups: no bus, arrays or radio, so the
 * generic bus would be a wrong picture (owner, 2026-11-12). By NORAD id, not name: a name
 * match on "STELLA" would also catch LEMUR-2-STELLA. Read from the live groups 2026-11-12.
 */
export const PASSIVE_SPHERES: ReadonlySet<string> = new Set([
  '900', // CALSPHERE 1
  '902', // CALSPHERE 2
  '1361', // LCS 1
  '1520', // CALSPHERE 4A
  '5398', // RIGIDSPHERE 2 (LCS 4)
  '7646', // STARLETTE
  '8820', // LAGEOS 1
  '16908', // AJISAI (EGS)
  '19751', // COSMOS 1989 (ETALON 1)
  '20026', // COSMOS 2024 (ETALON 2)
  '22195', // LAGEOS 2
  '22824', // STELLA
  '25398', // WESTPAC
  '27944', // LARETS
  '38077', // LARES
  '53105', // LARES-2
])

/** A satellite's stand-in family by name, group and NORAD id, or null when it gets none. */
export function satFamily(
  name: string,
  group: SatFieldGroup | undefined,
  noradId: string,
): SatFamily | null {
  if (group === undefined || !BUS_GROUPS.has(group)) return null
  if (PASSIVE_SPHERES.has(noradId)) return null
  return CUBESAT_NAME.test(name) ? 'cubesat' : 'generic-bus'
}
