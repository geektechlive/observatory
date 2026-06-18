import { z } from 'zod'

export const SolarScaleDaySchema = z.object({
  offset: z.number(), // -1 = yesterday, 0 = today, 1..3 = forecast
  date: z.string(),
  r: z.number(), // Radio blackout scale 0-5
  s: z.number(), // Solar radiation storm scale 0-5
  g: z.number(), // Geomagnetic storm scale 0-5
})

export const SolarActivitySchema = z.object({
  xray: z.object({
    /** Downsampled long-band (0.1-0.8nm) flux, W/m², oldest → newest. */
    series: z.array(z.number()),
    currentFlux: z.number().nullable(),
    /** GOES flare class, e.g. "B4.8" / "M1.2" / "X2.0". */
    currentClass: z.string().nullable(),
  }),
  scales: z.array(SolarScaleDaySchema),
  updatedAt: z.string(),
})

export type SolarScaleDay = z.infer<typeof SolarScaleDaySchema>
export type SolarActivity = z.infer<typeof SolarActivitySchema>

/** Map GOES long-band X-ray flux (W/m²) to a flare class string. */
export function fluxToClass(flux: number | null): string | null {
  if (flux === null || !isFinite(flux) || flux <= 0) return null
  const bands: [number, string][] = [
    [1e-4, 'X'],
    [1e-5, 'M'],
    [1e-6, 'C'],
    [1e-7, 'B'],
  ]
  for (const [floor, letter] of bands) {
    if (flux >= floor) return `${letter}${(flux / floor).toFixed(1)}`
  }
  return `A${(flux / 1e-8).toFixed(1)}`
}
