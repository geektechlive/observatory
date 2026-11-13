import { Label } from '@/components/ui/Label'
import { Readout } from '@/components/ui/Readout'
import { EPOCH_WINDOW_MS } from '@/lib/orbit/satCatalog'
import { KM_TO_MI } from '@/lib/orrery'
import type { ModelDescriptor } from '@/lib/orrery/modelDescriptor'
import { epochAgeText, satAltitudeKm } from '@/lib/orrery/satView'
import { objectTypeText, ownerNote, ownerText, rcsText } from '@/lib/satcatWords'
import type { SatcatEntry } from '@/lib/spacetrack'
import { reentryWhen } from '@/lib/spaceTrackText'
import type { DiscosObject, Reentry } from '@/schemas/spaceTrack'

import { DiscosFacts } from './DiscosFacts'
import styles from './orrery.module.css'
import { SAT_TOGGLES } from './satToggles'
import { Term } from './Term'
import type { SatInfo } from './three/OrreryRenderer'

const GROUP_LABEL = new Map<string, string>([
  ...SAT_TOGGLES.flatMap((t) => t.groups.map((g) => [g, t.label] as const)),
  ['reentry', 'Predicted re-entry (Space-Track.org)'],
])
const WINDOW_DAYS = EPOCH_WINDOW_MS / 86_400_000
/** Starlink's elements where CelesTrak's supplemental GP has them (#209). */
const SUPGP_SOURCE =
  'CelesTrak supplemental GP, fitted to SpaceX’s published Starlink ephemerides (OMM)'

interface SatFactsProps {
  info: SatInfo
  simMs: number
  /** Its Space-Track catalogue entry, once its shard has loaded (#101). */
  catalog?: SatcatEntry | null | undefined
  /** ESA DISCOS's physical facts, for the few objects asked about (#101). */
  physical?: DiscosObject | null | undefined
  /** Space-Track's latest re-entry prediction for it, if any (#101). */
  reentry?: Reentry | null | undefined
  /** The model the scene draws in place of its dot, when it has one of its own (#194). */
  sceneModel?: ModelDescriptor | undefined
}

/**
 * A satellite in the inspector (#98): what it is, how high, and how old its orbit data
 * is. The position is SGP4 from CelesTrak's elements, computed in the browser, and only
 * within three days of the elements' epoch, where they stay good. Space-Track adds who
 * owns it, when it launched and its radar size, and any re-entry prediction; ESA DISCOS
 * its mass, size and operator (#101).
 */
export function SatFacts({ info, simMs, catalog, physical, reentry, sceneModel }: SatFactsProps) {
  const altKm = info.teme ? satAltitudeKm(info.teme) : null
  // Without a pass for the loaded objects a null position says nothing about the date (#206).
  const computed = info.computed !== false
  const radar = catalog ? rcsText(catalog.rcsSize) : null
  const note = ownerNote(info.noradId)
  return (
    <>
      <p className={styles.inspectorMeta ?? ''}>
        <Label>Satellite</Label> <Label>{`NORAD ${info.noradId}`}</Label>
      </p>
      <p className={styles.inspectorText ?? ''}>
        Drawn in the Earth frame at true scale out to geostationary orbit, from CelesTrak’s orbit
        data, worked forward in your browser with SGP4.
      </p>
      {reentry && (
        <p className={styles.inspectorText ?? ''} role="status" data-reentry="">
          Predicted to re-enter {reentryWhen(reentry)} (Space-Track.org TIP message).
        </p>
      )}
      {altKm === null && !computed && (
        <p className={styles.inspectorText ?? ''} role="status">
          {info.pending === true
            ? 'Working out its position…'
            : 'Position not available right now.'}
        </p>
      )}
      {altKm === null && computed && (
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
        <dt>
          <Term id="epoch">Orbit data</Term>
        </dt>
        <dd className={styles.inspectorText ?? ''}>
          {Number.isFinite(info.epochMs) ? epochAgeText(info.epochMs, simMs) : 'unknown'}
        </dd>
        <dt>Source</dt>
        <dd className={styles.inspectorText ?? ''}>
          {info.supgp === true ? SUPGP_SOURCE : 'CelesTrak GP data (OMM)'}
        </dd>
        {sceneModel && (
          <>
            <dt>Shape</dt>
            <dd className={styles.inspectorText ?? ''}>
              Its own model once loaded, drawn at a fixed size
              <br />
              {`${sceneModel.attitudeNote} · not to scale`}
            </dd>
          </>
        )}
        {catalog && (
          <>
            <dt>Kind</dt>
            <dd className={styles.inspectorText ?? ''}>{objectTypeText(catalog.objectType)}</dd>
            <dt>Catalogued owner</dt>
            <dd className={styles.inspectorText ?? ''}>
              {ownerText(catalog.country)}
              {note && ` · ${note}`}
            </dd>
            {catalog.launch && (
              <>
                <dt>Launched</dt>
                <dd className={styles.inspectorText ?? ''}>
                  {catalog.site ? `${catalog.launch}, site ${catalog.site}` : catalog.launch}
                  {catalog.intlDes ? ` · ${catalog.intlDes}` : ''}
                </dd>
              </>
            )}
            {radar && (
              <>
                <dt>Radar size</dt>
                <dd className={styles.inspectorText ?? ''}>{radar}</dd>
              </>
            )}
            <dt>Catalogue</dt>
            <dd className={styles.inspectorText ?? ''}>Space-Track.org (USSPACECOM) SATCAT</dd>
          </>
        )}
        {physical && <DiscosFacts object={physical} />}
      </dl>
    </>
  )
}
