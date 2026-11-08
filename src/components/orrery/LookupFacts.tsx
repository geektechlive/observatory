import { Label } from '@/components/ui/Label'
import { Readout } from '@/components/ui/Readout'
import { describeLookup, lookupOrbit } from '@/lib/orrery/lookupTrack'
import { AU_KM, formatLightTime, KM_TO_MI } from '@/lib/orrery/units'
import type { LookupObject, TrajectoryResponse } from '@/schemas/jplLookup'
import type { OrreryTrack } from '@/schemas/orreryBodies'

import styles from './orrery.module.css'
import { formatSimUtc } from './simDate'

const JD_UNIX_EPOCH = 2440587.5
const DAY_MS = 86_400_000
const fmtAu = (au: number) => (au < 10 ? au.toFixed(3) : au.toFixed(2))
const fmtKm = (km: number) =>
  km >= 1e9 ? `${(km / 1e9).toFixed(2)} billion` : `${(km / 1e6).toFixed(1)} million`

interface LookupFactsProps {
  object: LookupObject | null
  trajectory: TrajectoryResponse | null
  /** Horizons' Earth from /api/orrery-bodies, where it covers the date. */
  earth: OrreryTrack | null
  simMs: number
  /** A failed answer in plain words (useLookupTrack), or null. */
  problem: string | null
  loading: boolean
  onRemove: () => void
}

/**
 * An object looked up at JPL and shown in the orrery (#145), in the inspector: what
 * JPL's Small-Body Database says it is, where Horizons puts it, and which samples the
 * drawing rests on. Never a position past them.
 */
export function LookupFacts({
  object,
  trajectory,
  earth,
  simMs,
  problem,
  loading,
  onRemove,
}: LookupFactsProps) {
  const jd = simMs / DAY_MS + JD_UNIX_EPOCH
  const fine = trajectory?.fine ?? null
  const d = fine ? describeLookup(fine, earth, jd) : null
  const orbitKind = fine && d ? lookupOrbit(fine, jd)?.kind : undefined
  const earthKm = d ? d.earthDistanceAu * AU_KM : 0
  const request = trajectory?.request

  return (
    <>
      {object && (
        <p className={styles.inspectorMeta ?? ''}>
          <Label>{object.kind === 'comet' ? 'Comet' : 'Asteroid'}</Label>
          {object.orbitClass && <Label>{object.orbitClass.name}</Label>}
          <Label>{`SPK-ID ${object.spkid}`}</Label>
        </p>
      )}
      {object && (object.neo || object.pha) && (
        <p className={styles.inspectorText ?? ''}>
          {object.neo && 'Near-Earth object'}
          {object.neo && object.pha && ' · '}
          {object.pha && 'Potentially hazardous (a label for size and orbit, not a forecast)'}
        </p>
      )}
      {problem && (
        <p className={styles.inspectorText ?? ''} role="status">
          {problem}
        </p>
      )}
      {!problem && !d && (
        <p className={styles.inspectorText ?? ''} role="status">
          {fine
            ? `No JPL samples for this date yet. Positions are never extrapolated.${loading ? ' Asking JPL for them…' : ''}`
            : 'Asking JPL Horizons where it is…'}
        </p>
      )}
      {d && (
        <dl className={styles.facts ?? ''}>
          <dt>From the Sun</dt>
          <dd>
            <Readout value={fmtAu(d.sunDistanceAu)} unit="au" />{' '}
            <Label>{fmtKm(d.sunDistanceAu * AU_KM)} km</Label>
          </dd>
          <dt>From Earth</dt>
          <dd>
            <Readout value={fmtAu(d.earthDistanceAu)} unit="au" />{' '}
            <Label>
              {fmtKm(earthKm)} km · {fmtKm(earthKm * KM_TO_MI)} mi
            </Label>
          </dd>
          <dt>Light time</dt>
          <dd>
            <Readout value={formatLightTime(d.lightTimeFromEarthS)} />
          </dd>
          <dt>Seen from Earth</dt>
          <dd>
            <Readout value={Math.abs(d.rangeRateKmS).toFixed(1)} unit="km/s" />{' '}
            <Label>{d.rangeRateKmS < 0 ? 'approaching' : 'receding'}</Label>
          </dd>
          <dt>Sample time</dt>
          <dd className={styles.inspectorText ?? ''}>{formatSimUtc(simMs)}</dd>
        </dl>
      )}
      {request && (
        <p className={styles.inspectorText ?? ''}>
          Asked on demand from JPL Horizons: samples from {request.start} to {request.end}, every{' '}
          {String(Math.round(request.stepMinutes / 1440))} days, interpolated between them (cubic
          Hermite).
          {orbitKind === 'osculating' &&
            ' Its line is the whole orbit: the osculating ellipse through its position and velocity now, so it drifts from the true path over years.'}
          {orbitKind === 'sampled' &&
            ' Its line is the sampled path itself: the orbit is open (hyperbolic), so there is no loop to draw.'}
          {d?.earthSource === 'kepler' &&
            ' Earth here is from JPL’s approximate elements: the Horizons samples for Earth do not cover this date.'}
        </p>
      )}
      <p className={styles.inspectorText ?? ''}>
        <button type="button" className={styles.chipBtn ?? ''} onClick={onRemove}>
          Remove from orrery
        </button>
      </p>
    </>
  )
}
