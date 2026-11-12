import { z } from 'zod'

import { SampledSpanSchema } from './orreryBodies'

/**
 * /api/orrery-dwarfs (#99 item 8): Pluto, Ceres, Eris, Makemake and Haumea, built by
 * scripts/orrery-dwarfs.mjs in the refresh job and served straight from KV. Its own key
 * and endpoint, so only a visitor who switches the dwarf planets on (or follows a link to
 * one) downloads them; the Tonight panel's comets never carry them.
 *
 * One coarse Horizons span per body, positions only ([x, y, z] per sample), heliocentric
 * ecliptic J2000 au at 6 decimals, TDB. Pluto's covers the whole clock; the other four
 * only JPL's 1600–2500. The orbit line is drawn from the elements in
 * src/lib/orrery/dwarfs.ts, never the marker.
 */
export const OrreryDwarfSchema = z.object({
  /** `sb:<SPK-ID>`, as for the comets. */
  id: z.string(),
  spkid: z.string(),
  name: z.string(),
  /** Horizons' own "Target body name", asserted exactly ("Pluto Barycenter (9)"). */
  target: z.string(),
  /** Where Horizons' ephemeris ends, if the span ran into it (ISO). */
  availableFrom: z.string().nullable(),
  availableTo: z.string().nullable(),
  coarse: SampledSpanSchema,
})

export const OrreryDwarfsSchema = z.object({
  generatedAt: z.string(),
  /** When the spans were fetched; reused for a day. */
  coarseFetchedAt: z.string(),
  frame: z.literal('ecliptic-J2000'),
  center: z.literal('Sun'),
  timeScale: z.literal('TDB'),
  units: z.object({ position: z.literal('au') }),
  sourceType: z.literal('ephemeris'),
  provider: z.literal('jpl-horizons'),
  /** Pluto first, then Ceres, Eris, Makemake and Haumea, as far as each answered. */
  dwarfs: z.array(OrreryDwarfSchema),
  /** Bodies the last refresh could not fetch, and why (a body keeps its last span). */
  missing: z.array(z.object({ id: z.string(), reason: z.string() })),
})

export type OrreryDwarf = z.infer<typeof OrreryDwarfSchema>
export type OrreryDwarfs = z.infer<typeof OrreryDwarfsSchema>
