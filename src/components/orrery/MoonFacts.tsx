import { Label } from '@/components/ui/Label'
import { Readout } from '@/components/ui/Readout'
import { moonOrbit } from '@/lib/orrery/moonOrbit'
import { type MoonBody, moonCoverage } from '@/lib/orrery/moonState'
import { AU_KM } from '@/lib/orrery/units'

import styles from './orrery.module.css'
import { formatSimUtc } from './simDate'

const HOURS_PER_DAY = 24

/** Under a day in hours (Phobos), else days. */
const fmtPeriod = (days: number) =>
  days < 1 ? `${(days * HOURS_PER_DAY).toFixed(1)} h` : `${String(days)} d`

interface MoonFactsProps {
  moon: MoonBody
  jd: number
  simMs: number
}

/**
 * A moon in the inspector (#107): its planet, how far from it, its period and where the
 * vector comes from. The scene places moons on an exaggerated scale around their planet,
 * so the panel says the view is not to scale. Never a position past the data.
 */
export function MoonFacts({ moon, jd, simMs }: MoonFactsProps) {
  const state = moon.relative(jd)
  const km = state ? Math.hypot(state.position.x, state.position.y, state.position.z) * AU_KM : null
  const naif = moon.key.replace(/^naif:/, '')
  const orbitKind = km === null ? null : (moonOrbit(moon, jd)?.kind ?? null)

  return (
    <>
      <p className={styles.inspectorMeta ?? ''}>
        <Label>Moon</Label> <Label>{`NAIF ${naif}`}</Label>
      </p>
      <p className={styles.inspectorText ?? ''}>
        {moon.parent === 'Earth'
          ? 'Drawn in the Earth frame, with the L1 craft and close approaches: its true direction, with distances past geostationary orbit compressed, so not to scale.'
          : `Drawn on an exaggerated scale around ${moon.parent} so it can be seen: its distance in the view is not to scale.`}
      </p>
      {km === null ? (
        <p className={styles.inspectorText ?? ''} role="status">
          No data for this date. JPL Horizons samples here cover {moonCoverage(moon) ?? 'no dates'}.
          Positions are never extrapolated past them.
        </p>
      ) : null}
      <dl className={styles.facts ?? ''}>
        <dt>Planet</dt>
        <dd className={styles.inspectorText ?? ''}>{moon.parent}</dd>
        {km !== null && (
          <>
            <dt>From {moon.parent}</dt>
            <dd>
              <Readout value={Math.round(km).toLocaleString('en-US')} unit="km" />
            </dd>
          </>
        )}
        <dt>Orbital period</dt>
        <dd className={styles.inspectorText ?? ''}>{fmtPeriod(moon.periodDays)}</dd>
        <dt>Mean distance</dt>
        <dd className={styles.inspectorText ?? ''}>
          {moon.semiMajorAxisKm.toLocaleString('en-US')} km
        </dd>
        <dt>Source</dt>
        <dd className={styles.inspectorText ?? ''}>JPL Horizons · {moon.center}</dd>
        {orbitKind && (
          <>
            <dt>Orbit line</dt>
            <dd className={styles.inspectorText ?? ''}>
              {orbitKind === 'sampled'
                ? 'One orbit of JPL Horizons samples around this date'
                : 'Osculating ellipse from its position and velocity now: the data covers less than one orbit'}
            </dd>
          </>
        )}
        <dt>Horizons target</dt>
        <dd className={styles.inspectorText ?? ''}>{moon.target ?? 'not stated'}</dd>
        <dt>Sample time</dt>
        <dd className={styles.inspectorText ?? ''}>{formatSimUtc(simMs)}</dd>
      </dl>
    </>
  )
}
