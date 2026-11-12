import { Label } from '@/components/ui/Label'
import { type DwarfMoonEntry, dwarfMoonFacts } from '@/lib/orrery/dwarfView'

import styles from './orrery.module.css'

const km = (n: number) => `${Math.round(n).toLocaleString('en-US')} km`

/**
 * Charon in the inspector (#99): where JPL Horizons places it from the Pluto barycentre,
 * which days the site carries, JPL's own window, and that the pair is drawn to Pluto's
 * scale, magnified against the rest of the scene. Nothing is computed in place of a
 * missing position.
 */
export function DwarfMoonFacts({ entry, simMs }: { entry: DwarfMoonEntry; simMs: number }) {
  const f = dwarfMoonFacts(entry, simMs)
  return (
    <>
      <p className={styles.inspectorMeta ?? ''}>
        <Label>{`Moon of ${entry.parent.label}`}</Label>
        <Label>{`NAIF ${entry.moon.naifId}`}</Label>
      </p>
      {f.fromBarycentreKm === null && (
        <p className={styles.inspectorText ?? ''} role="status">
          {`No position for this date: the site carries Charon's samples for ${f.samples} only, around the last data refresh. JPL's ephemeris covers ${f.ephemeris}. Positions are never extrapolated.`}
        </p>
      )}
      <dl className={styles.facts ?? ''}>
        {f.fromBarycentreKm !== null && (
          <>
            <dt>From the barycentre</dt>
            <dd>{km(f.fromBarycentreKm)}</dd>
          </>
        )}
        <dt>Orbit</dt>
        <dd className={styles.inspectorText ?? ''}>
          {`${km(f.semiMajorAxisKm)} from Pluto, every ${f.periodDays.toFixed(2)} days · radius ${km(f.radiusKm)}`}
        </dd>
        <dt>Placed by</dt>
        <dd className={styles.inspectorText ?? ''}>
          {`JPL Horizons, "${f.target}" from the Pluto system's barycentre (${f.center}), every 6 hours for ${f.samples}. JPL's ephemeris covers ${f.ephemeris}.`}
        </dd>
        <dt>Scale</dt>
        <dd className={styles.inspectorText ?? ''}>
          {`Shown only with Pluto or Charon chosen. The pair is drawn to Pluto's own scale, magnified against the rest of the scene. Pluto's marker is the barycentre; Pluto itself sits about 2,100 km from it, opposite Charon.`}
        </dd>
      </dl>
    </>
  )
}
