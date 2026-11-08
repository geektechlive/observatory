import { Label } from '@/components/ui/Label'
import { Readout } from '@/components/ui/Readout'
import {
  asteroidGeocentric,
  diameterRangeM,
  esaApproachFor,
  impactTerms,
  riskEntryFor,
} from '@/lib/orrery/asteroids'
import { l1TransitMinutes } from '@/lib/orrery/earthFrame'
import { AU_KM, formatLightTime, LD_KM } from '@/lib/orrery/units'
import type { OrreryTrack } from '@/schemas/orreryBodies'
import type { OrreryApproach, OrreryNeo, ScoutObject } from '@/schemas/orreryNeo'

import styles from './orrery.module.css'
import { formatSimUtc } from './simDate'
import { Term } from './Term'

const ld = (au: number) => {
  const v = (au * AU_KM) / LD_KM
  return v < 10 ? v.toFixed(2) : v.toFixed(1)
}
const km = (au: number) => Math.round(au * AU_KM).toLocaleString('en-US')
const day = (jd: number) => new Date((jd - 2440587.5) * 86_400_000).toISOString().slice(0, 10)
const utc = (iso: string) => `${iso.slice(0, 16).replace('T', ' ')} UTC`

/** "about 4–9 m" from H, or JPL's diameter when it has one. */
function sizeText(a: OrreryApproach): string | null {
  if (a.diameterKm !== null) return `${Math.round(a.diameterKm * 1000).toLocaleString('en-US')} m`
  if (a.h === null) return null
  const [lo, hi] = diameterRangeM(a.h).map((m) =>
    m < 100 ? Math.round(m) : Math.round(m / 10) * 10,
  )
  return `about ${String(lo)}–${String(hi)} m (from its brightness, H ${a.h.toFixed(1)})`
}

interface AsteroidFactsProps {
  approach: OrreryApproach
  neo: OrreryNeo
  earth: OrreryTrack | null
  jd: number
  simMs: number
}

/**
 * A close approach in the inspector (#92; spec Parts 10, 12, 16): JPL CAD's closest
 * approach with its 3-sigma range, where Horizons puts it now relative to Earth, its
 * size, ESA's view, and spec Part 12's four terms kept apart. Never a position past the
 * samples.
 */
export function AsteroidFacts({ approach: a, neo, earth, jd, simMs }: AsteroidFactsProps) {
  const now = asteroidGeocentric(a, earth, jd)
  const ca = a.closeApproach
  const risk = riskEntryFor(neo, a)
  const esa = esaApproachFor(neo, a)
  const terms = impactTerms(a, risk)
  const size = sizeText(a)
  const span = a.fine
  const spanEnd = span ? span.start + (span.samples.length / 6 - 1) * span.step : null

  return (
    <>
      <p className={styles.inspectorMeta ?? ''}>
        <Label>{a.pha ? 'Potentially hazardous asteroid' : 'Near-Earth asteroid'}</Label>{' '}
        <Label>{a.des}</Label>
      </p>
      <p className={styles.inspectorText ?? ''}>
        Drawn in the Earth frame: its true direction from Earth, with distances past geostationary
        orbit compressed, so not to scale.
      </p>
      {now === null ? (
        <p className={styles.inspectorText ?? ''} role="status">
          No position for this date.
          {span && spanEnd !== null
            ? ` JPL Horizons samples here cover ${day(span.start)} to ${day(spanEnd)}.`
            : ' JPL Horizons could not place it.'}{' '}
          Positions are never extrapolated.
        </p>
      ) : (
        <dl className={styles.facts ?? ''}>
          <dt>From Earth now</dt>
          <dd>
            <Readout value={ld(now.distAu)} unit="LD" /> <Label>{km(now.distAu)} km</Label>
          </dd>
          <dt>
            <Term id="range-rate">Seen from Earth</Term>
          </dt>
          <dd>
            <Readout value={Math.abs(now.rangeRateKmS).toFixed(1)} unit="km/s" />{' '}
            <Label>{now.rangeRateKmS < 0 ? 'approaching' : 'receding'}</Label>
          </dd>
          <dt>
            <Term id="light-time">Light time</Term>
          </dt>
          <dd>
            <Readout value={formatLightTime(now.lightSeconds)} />
          </dd>
        </dl>
      )}
      <dl className={styles.facts ?? ''}>
        <dt>Closest approach</dt>
        <dd>
          <Readout value={ld(ca.distAu)} unit="LD" /> <Label>{utc(ca.date)}</Label>
          <span className={styles.inspectorText ?? ''}>
            {' '}
            {km(ca.distAu)} km (LD: lunar distances). 3-sigma range {ld(ca.distMinAu)}–
            {ld(ca.distMaxAu)} LD; time uncertainty {ca.tSigma} (h:min).
          </span>
        </dd>
        <dt>Speed past Earth</dt>
        <dd>
          <Readout value={ca.vRelKms.toFixed(1)} unit="km/s" />
        </dd>
        {size && (
          <>
            <dt>Size</dt>
            <dd className={styles.inspectorText ?? ''}>{size}</dd>
          </>
        )}
      </dl>
      <ul className={styles.terms ?? ''} aria-label="Impact terms">
        {terms.map((t) => (
          <li key={t.id} data-applies={t.applies}>
            <strong>
              {t.label}: {t.applies ? 'Yes' : 'No'}
            </strong>{' '}
            {t.detail}
          </li>
        ))}
      </ul>
      {(risk ?? esa) ? (
        <p className={styles.inspectorText ?? ''}>
          ESA also lists it
          {risk
            ? `: on NEOCC's risk list${risk.psMax !== null ? `, Palermo ${risk.psMax.toFixed(2)}` : ''}${risk.years ? ` over ${risk.years}` : ''}`
            : ''}
          {esa
            ? `${risk ? ';' : ':'} NEOCC has its approach on ${esa.date.slice(0, 10)}${esa.missLd !== null ? ` at ${esa.missLd.toFixed(2)} LD` : ''}`
            : ''}
          .
        </p>
      ) : (
        <p className={styles.inspectorText ?? ''}>Not on ESA NEOCC’s lists this week.</p>
      )}
      <details className={styles.science ?? ''}>
        <summary>Scientific data</summary>
        <dl className={styles.facts ?? ''}>
          <dt>Source</dt>
          <dd>
            JPL CAD (approach), JPL Horizons (positions, Hermite between 3 h samples), ESA NEOCC
          </dd>
          <dt>Name</dt>
          <dd>{a.name.trim()}</dd>
          <dt>Orbit solution</dt>
          <dd>{a.orbitId}</dd>
          <dt>Closest approach JD (TDB)</dt>
          <dd>{ca.jd.toFixed(5)}</dd>
          <dt>Sample time</dt>
          <dd>{formatSimUtc(simMs)}</dd>
          {now && (
            <>
              <dt>From Earth (au, ecliptic J2000)</dt>
              <dd>
                x {now.rel.x.toFixed(6)} · y {now.rel.y.toFixed(6)} · z {now.rel.z.toFixed(6)}
              </dd>
            </>
          )}
        </dl>
      </details>
    </>
  )
}

/** JPL Scout's unconfirmed object (#92): scores and uncertainty; no position is drawn. */
export function ScoutFacts({ object: o }: { object: ScoutObject }) {
  const pct = (v: number | null) => (v === null ? 'unknown' : `${String(v)}%`)
  return (
    <>
      <p className={styles.inspectorMeta ?? ''}>
        <Label>Unconfirmed (JPL Scout)</Label>
      </p>
      <p className={styles.inspectorText ?? ''}>
        Just found and too new for a confirmed orbit, so no position is drawn. Scout works out the
        possible orbits from the first observations.
      </p>
      <dl className={styles.facts ?? ''}>
        <dt>Near-Earth object?</dt>
        <dd>
          <Readout value={pct(o.neoScore)} /> <Label>chance</Label>
        </dd>
        <dt>
          <Term id="pha">Potentially hazardous?</Term>
        </dt>
        <dd>
          <Readout value={pct(o.phaScore)} /> <Label>chance</Label>
        </dd>
        <dt>Position on the sky</dt>
        <dd>
          <Readout value={o.unc === null ? '?' : `± ${String(o.unc)}′`} />{' '}
          <Label>now{o.uncP1 === null ? '' : `, ± ${String(o.uncP1)}′ in a day`} (1-sigma)</Label>
        </dd>
        {o.caDistLd !== null && (
          <>
            <dt>Closest to Earth</dt>
            <dd>
              <Readout value={o.caDistLd.toFixed(1)} unit="LD" />
            </dd>
          </>
        )}
        {o.rating !== null && (
          <>
            <dt>Scout rating</dt>
            <dd>
              <Readout value={`${String(o.rating)} of 4`} />
            </dd>
          </>
        )}
        <dt>Seen</dt>
        <dd className={styles.inspectorText ?? ''}>
          {o.nObs ?? '?'} observations over {o.arcHours === null ? '?' : o.arcHours.toFixed(1)} h
          {o.lastRun ? `; Scout ran ${utc(o.lastRun)}` : ''}
        </dd>
      </dl>
    </>
  )
}

export interface L1Wind {
  speed: number | null
  density: number | null
  bz: number | null
  updatedAt: string
}

export interface L1Cme {
  inbound: boolean
  arrival: string | null
}

/** L1 (#92): the solar wind measured there, its travel time to Earth, the next CME. */
export function L1Facts({ wind, cme }: { wind: L1Wind | null; cme: L1Cme | null }) {
  const transit = wind?.speed != null ? l1TransitMinutes(wind.speed) : null
  return (
    <>
      <p className={styles.inspectorMeta ?? ''}>
        <Label>Sun–Earth L1</Label>
      </p>
      <p className={styles.inspectorText ?? ''}>
        About 1.5 million km sunward of Earth, where DSCOVR and ACE measure the solar wind before it
        reaches us. Drawn in the Earth frame, not to scale.
      </p>
      {wind ? (
        <dl className={styles.facts ?? ''}>
          <dt>Solar wind</dt>
          <dd>
            <Readout
              value={wind.speed === null ? '?' : String(Math.round(wind.speed))}
              unit="km/s"
            />{' '}
            <Label>
              {wind.density === null ? '' : `${wind.density.toFixed(1)} p/cm³`}
              {wind.bz === null ? '' : ` · Bz ${wind.bz.toFixed(1)} nT`}
            </Label>
          </dd>
          {transit !== null && (
            <>
              <dt>To Earth</dt>
              <dd>
                <Readout value={`≈ ${String(Math.round(transit))} min`} />{' '}
                <Label>at this speed</Label>
              </dd>
            </>
          )}
          <dt>Measured</dt>
          <dd className={styles.inspectorText ?? ''}>{utc(wind.updatedAt)} (NOAA SWPC)</dd>
        </dl>
      ) : (
        <p className={styles.inspectorText ?? ''}>
          The solar-wind readings are unavailable right now.
        </p>
      )}
      <p className={styles.inspectorText ?? ''}>
        {cme?.inbound && cme.arrival
          ? `NOAA's WSA-ENLIL model has a CME reaching Earth about ${utc(cme.arrival)}. An arrival time only: the model gives no position to draw.`
          : cme
            ? "No Earth-directed CME in NOAA's latest WSA-ENLIL run."
            : 'The CME forecast is unavailable right now.'}
      </p>
    </>
  )
}
