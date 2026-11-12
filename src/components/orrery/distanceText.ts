import { AU_KM, KM_TO_MI } from '@/lib/orrery/units'

/** Below this, km: whole kilometres (#217). */
const MILLION = 1e6
const BILLION = 1e9
/** From this, au; between 1 million km and here, million km (about 15 million km). */
const AU_FROM_KM = 0.1 * AU_KM
/** Significant figures for the au beside a million-km readout. */
const AU_ASIDE_DIGITS = 3

export interface DistanceReadout {
  /** The number, for `<Readout value>`. */
  value: string
  /** Its unit, for `<Readout unit>`: 'km', 'million km' or 'au'. */
  unit: string
  /** The same distance in the other units, for the label beside it; may be empty. */
  aside: string
}

const whole = (n: number) => Math.round(n).toLocaleString('en-US')
/** `n` as it prints with `digits` decimals: units switch on this, so "1,000,000 km" can't show. */
const shown = (n: number, digits: number) => Number(n.toFixed(digits))

/** Kilometres or miles at any size: whole below a million, then million, then billion. */
function scaled(n: number): string {
  if (shown(n / MILLION, 1) >= 1000) return `${(n / BILLION).toFixed(2)} billion`
  if (Math.round(n) >= MILLION) return `${(n / MILLION).toFixed(1)} million`
  return whole(n)
}

const fmtAu = (au: number) => (shown(au, 3) < 10 ? au.toFixed(3) : au.toFixed(2))

/**
 * A distance for the orrery's inspector, in the unit its size reads best in (#217): whole
 * km below 1 million km, million km below 0.1 au, au from there. A close pass of a few
 * thousand km used to read "0.000 au / 0.0 million km", which looks like a collision.
 * Each unit is chosen by the value as printed, so a boundary never reads "1,000,000 km"
 * or "10.000 au". From 100 km up every readout keeps at least three significant figures;
 * below that it stays in whole km.
 */
export function distanceReadout(au: number, opts: { miles?: boolean } = {}): DistanceReadout {
  const km = au * AU_KM
  const miles = opts.miles === true ? [`${scaled(km * KM_TO_MI)} mi`] : []
  if (Math.round(km) < MILLION) return { value: whole(km), unit: 'km', aside: miles.join(' · ') }
  if (km < AU_FROM_KM) {
    return {
      value: (km / MILLION).toFixed(2),
      unit: 'million km',
      aside: [`${au.toPrecision(AU_ASIDE_DIGITS)} au`, ...miles].join(' · '),
    }
  }
  return { value: fmtAu(au), unit: 'au', aside: [`${scaled(km)} km`, ...miles].join(' · ') }
}

/** The same distance as prose: "6,371 km", "7.48 million km", "1.017 au". */
export function distanceText(au: number): string {
  const r = distanceReadout(au)
  return `${r.value} ${r.unit}`
}
