import { Label } from '@/components/ui/Label'
import { Readout } from '@/components/ui/Readout'
import { type DwarfEntry, dwarfFacts } from '@/lib/orrery/dwarfView'
import { AU_KM } from '@/lib/orrery/units'

import styles from './orrery.module.css'

const fmtAu = (au: number) => (au < 10 ? au.toFixed(3) : au.toFixed(2))
const fmtKm = (km: number) =>
  km >= 1e9 ? `${(km / 1e9).toFixed(2)} billion` : `${(km / 1e6).toFixed(1)} million`
const DAY_MS = 86_400_000
const JD_UNIX_EPOCH = 2440587.5
const dateOfJd = (jd: number) => new Date((jd - JD_UNIX_EPOCH) * DAY_MS).toISOString().slice(0, 10)

/**
 * A dwarf planet in the inspector (#99 item 8): where JPL Horizons places it, what span
 * covers which years, and that the orbit line is a two-body ellipse from SBDB elements.
 * Nothing is computed in place of a missing position.
 */
export function DwarfFacts({ entry, simMs }: { entry: DwarfEntry; simMs: number }) {
  const f = dwarfFacts(entry, simMs)
  return (
    <>
      <p className={styles.inspectorMeta ?? ''}>
        <Label>Dwarf planet</Label>
        <Label>{`SPK-ID ${entry.body.spkid}`}</Label>
      </p>
      {f.sunAu === null && (
        <p className={styles.inspectorText ?? ''} role="status">
          {`No position for this date: JPL's ephemeris covers about ${f.coverage}. Its orbit is still drawn; positions are never extrapolated.`}
        </p>
      )}
      <dl className={styles.facts ?? ''}>
        {f.sunAu !== null && (
          <>
            <dt>From the Sun</dt>
            <dd>
              <Readout value={fmtAu(f.sunAu)} unit="au" />{' '}
              <Label>{fmtKm(f.sunAu * AU_KM)} km</Label>
            </dd>
          </>
        )}
        <dt>Orbit</dt>
        <dd className={styles.inspectorText ?? ''}>
          {`a ${f.aAu.toFixed(2)} au · e ${f.e.toFixed(4)} · about ${f.periodYears.toFixed(f.periodYears < 10 ? 2 : 0)} years`}
        </dd>
        <dt>Placed by</dt>
        <dd className={styles.inspectorText ?? ''}>
          {`JPL Horizons, "${f.target}", one sample every ${String(entry.body.coarse.step)} days, ${f.coverage}`}
          {f.barycentre
            ? '. The marker is the Pluto–Charon barycentre, about 2,100 km from the centre of Pluto'
            : ''}
        </dd>
        <dt>Orbit line</dt>
        <dd className={styles.inspectorText ?? ''}>
          {`Two-body ellipse from SBDB osculating elements at ${dateOfJd(f.epochJd)}. It holds the orbit's shape, not the position along it, so far from that date the marker can sit off the line.`}
        </dd>
      </dl>
    </>
  )
}
