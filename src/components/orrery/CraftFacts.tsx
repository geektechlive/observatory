import { Label } from '@/components/ui/Label'
import { Readout } from '@/components/ui/Readout'
import type { DsnLink } from '@/lib/dsn'
import { craftModelFor } from '@/lib/orrery/craftModels'
import { describeCraft } from '@/lib/orrery/craftState'
import { formatLightTime } from '@/lib/orrery/units'
import type { OrreryTrack } from '@/schemas/orreryBodies'
import type { DiscosObject } from '@/schemas/spaceTrack'

import { DiscosFacts } from './DiscosFacts'
import { Distance } from './Distance'
import styles from './orrery.module.css'
import { formatSimUtc } from './simDate'
import { Term } from './Term'

const CATEGORY: Record<OrreryTrack['category'], string> = {
  spacecraft: 'Spacecraft',
  space_telescope: 'Space telescope',
  planet: 'Planet',
  moon: 'Moon',
}

/** First and last sampled dates of a track, YYYY-MM-DD, for "data covers ...". */
function coverage(track: OrreryTrack): string | null {
  const spans = [track.fine, track.coarse].filter((s) => s !== null)
  if (spans.length === 0) return null
  const stride = (s: NonNullable<OrreryTrack['fine']>) => (s === track.fine ? 6 : 3)
  const first = Math.min(...spans.map((s) => s.start))
  const last = Math.max(...spans.map((s) => s.start + (s.samples.length / stride(s) - 1) * s.step))
  const day = (jd: number) => new Date((jd - 2440587.5) * 86_400_000).toISOString().slice(0, 10)
  return `${day(first)} to ${day(last)}`
}

interface CraftFactsProps {
  track: OrreryTrack
  earth: OrreryTrack | null
  jd: number
  simMs: number
  link: DsnLink | undefined
  /** ESA DISCOS's mass, size and operator (#101), when the refresh job has them. */
  physical?: DiscosObject | null | undefined
}

/**
 * A spacecraft (or the Moon) in the inspector (#93; spec Parts 10, 16): where JPL
 * Horizons puts it, how far, light time, approaching or receding, whether DSN is
 * talking to it now, and how far to trust the position. Never a position past the data.
 */
export function CraftFacts({ track, earth, jd, simMs, link, physical }: CraftFactsProps) {
  const d = describeCraft(track, earth, jd)
  const closeToEarth = track.group === 'l1' || track.group === 'moon'
  // How the craft is drawn up close, and whose model it is (#115).
  const model = craftModelFor(track.naifId)

  return (
    <>
      <p className={styles.inspectorMeta ?? ''}>
        <Label>{CATEGORY[track.category]}</Label> <Label>{`NAIF ${track.naifId}`}</Label>
      </p>
      <p className={styles.inspectorText ?? ''}>{track.mission}</p>
      {closeToEarth && (
        <p className={styles.inspectorText ?? ''}>
          Near Earth it is drawn in the Earth frame: its true direction, with distances past
          geostationary orbit compressed, so it is not to scale. Zoomed out it sits on Earth’s
          marker; choose Earth–Moon to see it apart.
        </p>
      )}
      {d === null ? (
        <p className={styles.inspectorText ?? ''} role="status">
          No data for this date. JPL Horizons samples here cover {coverage(track) ?? 'no dates'}.
          Positions are never extrapolated past them.
        </p>
      ) : (
        <>
          <dl className={styles.facts ?? ''}>
            <dt>From the Sun</dt>
            <dd>
              <Distance au={d.sunDistanceAu} />
            </dd>
            <dt>From Earth</dt>
            <dd>
              <Distance au={d.earthDistanceAu} miles />
            </dd>
            <dt>
              <Term id="light-time">Light time</Term>
            </dt>
            <dd>
              <Readout value={formatLightTime(d.lightTimeFromEarthS)} />
            </dd>
            <dt>
              <Term id="range-rate">Seen from Earth</Term>
            </dt>
            <dd>
              <Readout value={Math.abs(d.rangeRateKmS).toFixed(1)} unit="km/s" />{' '}
              <Label>{d.rangeRateKmS < 0 ? 'approaching' : 'receding'}</Label>
            </dd>
            {track.category !== 'moon' && (
              <>
                <dt>
                  <Term id="dsn">Deep Space Network</Term>
                </dt>
                <dd className={styles.inspectorText ?? ''} data-dsn={link ? 'contact' : 'none'}>
                  {link
                    ? `In contact now: ${link.station}, ${link.dish}${link.bands.length ? ` (${link.bands.join(', ')} band)` : ''}`
                    : 'Not in contact now'}
                </dd>
              </>
            )}
            <dt>Source</dt>
            <dd className={styles.inspectorText ?? ''}>{d.state.sourceProvider}</dd>
            <dt>
              <Term id="ephemeris">Position type</Term>
            </dt>
            <dd className={styles.inspectorText ?? ''}>
              {d.predicted
                ? `Ephemeris: a prediction past tracking data (to ${String(track.observedUntil)})`
                : 'Ephemeris: JPL’s reconstructed trajectory'}{' '}
              · confidence {d.state.confidence}
            </dd>
            <dt>Sample time</dt>
            <dd className={styles.inspectorText ?? ''}>{formatSimUtc(simMs)}</dd>
            {model && (
              <>
                <dt>Shape</dt>
                <dd className={styles.inspectorText ?? ''}>
                  {model.kind === 'nasa' ? (
                    <a href={model.sourceUrl} target="_blank" rel="noreferrer">
                      {`3D model: ${model.credit}`}
                    </a>
                  ) : (
                    'Simplified model: no NASA model published to reuse'
                  )}
                  <br />
                  {`${model.attitudeNote} · not to scale`}
                </dd>
              </>
            )}
            {physical && <DiscosFacts object={physical} />}
          </dl>
          <ul className={styles.reasons ?? ''} aria-label="Why this confidence">
            {d.state.confidenceReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <details className={styles.science ?? ''}>
            <summary>Scientific data</summary>
            <dl className={styles.facts ?? ''}>
              <dt>Frame</dt>
              <dd>
                {d.state.referenceFrame}, centre {d.state.referenceCenter}
              </dd>
              <dt>Time scale</dt>
              <dd>{d.state.timeScale}</dd>
              <dt>Julian date</dt>
              <dd>{jd.toFixed(5)}</dd>
              <dt>Position (au)</dt>
              <dd>
                x {d.state.positionAu.x.toFixed(6)} · y {d.state.positionAu.y.toFixed(6)} · z{' '}
                {d.state.positionAu.z.toFixed(6)}
              </dd>
              {d.state.velocityAuPerDay && (
                <>
                  <dt>Velocity (au/day)</dt>
                  <dd>
                    x {d.state.velocityAuPerDay.x.toExponential(4)} · y{' '}
                    {d.state.velocityAuPerDay.y.toExponential(4)} · z{' '}
                    {d.state.velocityAuPerDay.z.toExponential(4)}
                  </dd>
                </>
              )}
              <dt>Horizons target</dt>
              <dd>{track.target ?? 'not stated'}</dd>
              <dt>Accuracy</dt>
              <dd>{d.state.accuracyDescription}</dd>
            </dl>
          </details>
        </>
      )}
    </>
  )
}
