import { Label } from '@/components/ui/Label'
import { Readout } from '@/components/ui/Readout'
import { EPOCH_WINDOW_MS } from '@/lib/orbit/satCatalog'
import { KM_TO_MI } from '@/lib/orrery'
import { epochAgeText, satAltitudeKm } from '@/lib/orrery/satView'

import styles from './orrery.module.css'
import { SAT_TOGGLES } from './satToggles'
import type { SatInfo } from './three/OrreryRenderer'

const GROUP_LABEL = new Map(SAT_TOGGLES.flatMap((t) => t.groups.map((g) => [g, t.label] as const)))
const WINDOW_DAYS = EPOCH_WINDOW_MS / 86_400_000

/**
 * A satellite in the inspector (#98): what it is, how high, and how old its orbit data
 * is. The position is SGP4 from CelesTrak's elements, computed in the browser, and only
 * within three days of the elements' epoch, where they stay good.
 */
export function SatFacts({ info, simMs }: { info: SatInfo; simMs: number }) {
  const altKm = info.teme ? satAltitudeKm(info.teme) : null
  return (
    <>
      <p className={styles.inspectorMeta ?? ''}>
        <Label>Satellite</Label> <Label>{`NORAD ${info.noradId}`}</Label>
      </p>
      <p className={styles.inspectorText ?? ''}>
        Drawn in the Earth frame at true scale out to geostationary orbit, from CelesTrak’s orbit
        data, worked forward in your browser with SGP4.
      </p>
      {altKm === null && (
        <p className={styles.inspectorText ?? ''} role="status">
          No position at this date: satellites are drawn only within {String(WINDOW_DAYS)} days of
          their orbit data, where it stays accurate.
        </p>
      )}
      <dl className={styles.facts ?? ''}>
        <dt>Group</dt>
        <dd className={styles.inspectorText ?? ''}>{GROUP_LABEL.get(info.group) ?? info.group}</dd>
        {altKm !== null && (
          <>
            <dt>Height</dt>
            <dd>
              <Readout value={Math.round(altKm).toLocaleString('en-US')} unit="km" />{' '}
              <Label>{`${Math.round(altKm * KM_TO_MI).toLocaleString('en-US')} mi`}</Label>
            </dd>
          </>
        )}
        <dt>Orbit data</dt>
        <dd className={styles.inspectorText ?? ''}>
          {Number.isFinite(info.epochMs) ? epochAgeText(info.epochMs, simMs) : 'unknown'}
        </dd>
        <dt>Source</dt>
        <dd className={styles.inspectorText ?? ''}>CelesTrak GP data (OMM)</dd>
      </dl>
    </>
  )
}
