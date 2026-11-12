import { Label } from '@/components/ui/Label'
import { Readout } from '@/components/ui/Readout'
import { type SmallBodyEntry, smallBodyFacts } from '@/lib/orrery/smallBodyView'
import { AU_KM } from '@/lib/orrery/units'

import styles from './orrery.module.css'
import { formatSimUtc } from './simDate'

const fmtAu = (au: number) => (au < 10 ? au.toFixed(3) : au.toFixed(2))
const fmtKm = (km: number) =>
  km >= 1e9 ? `${(km / 1e9).toFixed(2)} billion` : `${(km / 1e6).toFixed(1)} million`

const SPAN_TEXT = {
  fine: 'JPL Horizons, daily samples with velocity',
  coarse: 'JPL Horizons, whole-path samples',
} as const

/**
 * A comet or interstellar object in the inspector (#99), from /api/orrery-smallbodies.
 * Only what the payload carries: v∞ and the discovery date exist for 1I, 2I and 3I alone,
 * and a comet with an osculating e just over 1 is not called hyperbolic.
 */
export function SmallBodyFacts({ entry, simMs }: { entry: SmallBodyEntry; simMs: number }) {
  const { body } = entry
  const f = smallBodyFacts(body, simMs)
  const sol = f.solution
  return (
    <>
      <p className={styles.inspectorMeta ?? ''}>
        <Label>{f.kindLabel}</Label>
        <Label>{body.des}</Label>
        <Label>{`SPK-ID ${body.spkid}`}</Label>
      </p>
      {f.sunAu === null && (
        <p className={styles.inspectorText ?? ''} role="status">
          No JPL samples for this date. Positions are never extrapolated.
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
        <dt>Eccentricity</dt>
        <dd className={styles.inspectorText ?? ''}>
          {f.e.toFixed(4)}
          {f.hyperbolic ? ' · hyperbolic (e > 1): the Sun cannot hold it' : ''}
        </dd>
        {f.vInfKms !== null && (
          <>
            <dt>Speed far from the Sun</dt>
            <dd>
              <Readout value={f.vInfKms.toFixed(1)} unit="km/s" /> <Label>v∞</Label>
            </dd>
          </>
        )}
        {f.discovered !== null && (
          <>
            <dt>Discovered</dt>
            <dd className={styles.inspectorText ?? ''}>{f.discovered}</dd>
          </>
        )}
        {sol && (
          <>
            <dt>Orbit solution</dt>
            <dd className={styles.inspectorText ?? ''}>
              {[
                sol.ref,
                sol.date && `computed ${sol.date}`,
                sol.observations !== null && `${String(sol.observations)} observations`,
                sol.dataArc &&
                  `fitted to observations from ${sol.dataArc.from} to ${sol.dataArc.to}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </dd>
          </>
        )}
        {f.solutionAtDate !== null && (
          <>
            <dt>At this date</dt>
            <dd className={styles.inspectorText ?? ''}>
              {f.solutionAtDate === 'observed'
                ? 'Inside the observations the orbit is fitted to'
                : 'Outside the observations the orbit is fitted to: extrapolated from them'}
            </dd>
          </>
        )}
        {f.span !== null && (
          <>
            <dt>Position from</dt>
            <dd className={styles.inspectorText ?? ''}>{SPAN_TEXT[f.span]}</dd>
          </>
        )}
        <dt>Sample time</dt>
        <dd className={styles.inspectorText ?? ''}>{formatSimUtc(simMs)}</dd>
      </dl>
      <p className={styles.inspectorText ?? ''}>
        {body.coarse
          ? 'Its line is its path as JPL Horizons samples it.'
          : 'Its orbit line is drawn from its orbital elements (Sun’s pull only), as a line: the marker is placed only from JPL’s samples.'}
      </p>
    </>
  )
}
