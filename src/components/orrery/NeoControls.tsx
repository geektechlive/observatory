import type { NeoFilter, NeoWindow } from '@/lib/orrery/asteroids'
import type { ScoutObject } from '@/schemas/orreryNeo'

import styles from './orrery.module.css'
import { Switch } from './Switch'

const WINDOWS: { id: NeoWindow; label: string }[] = [
  { id: 'day', label: 'Within a day' },
  { id: 'week', label: 'Within a week' },
  { id: 'all', label: 'All' },
]

interface NeoControlsProps {
  filter: NeoFilter
  onFilter: (f: NeoFilter) => void
  /** Approaches drawn now, and in the data. */
  shown: number
  total: number
  /** How the close-approach data is doing: a count and age, or why there is none. */
  status: string
  /** JPL Scout's unconfirmed objects (no positions). */
  scout: readonly ScoutObject[]
  sunLine: boolean
  onSunLine: (on: boolean) => void
  onSelect: (key: string) => void
}

/** Scout's objects listed first by how likely each is a near-Earth object. */
const SCOUT_SHOWN = 8

/**
 * The near-Earth groups of the controls (#92; spec Parts 12 and 19): close approaches
 * with their filters, JPL Scout's unconfirmed objects, and the Sun–Earth line. Each
 * term is explained in place, since phones have no hover (#122).
 */
export function NeoControls({
  filter,
  onFilter,
  shown,
  total,
  status,
  scout,
  sunLine,
  onSunLine,
  onSelect,
}: NeoControlsProps) {
  const ranked = [...scout]
    .sort((a, b) => (b.neoScore ?? 0) - (a.neoScore ?? 0))
    .slice(0, SCOUT_SHOWN)
  return (
    <>
      <section className={styles.group ?? ''} aria-labelledby="orrery-neo">
        <h2 id="orrery-neo" className={styles.groupTitle ?? ''}>
          Near-Earth objects
        </h2>
        <p className={styles.switchHint ?? ''}>
          Asteroids passing within 0.05 au (19 lunar distances) of Earth. The data covers ±10 days
          of today; closest approach is counted from the date shown.
        </p>
        <div className={styles.chipRow ?? ''} role="radiogroup" aria-label="Closest approach">
          {WINDOWS.map((w) => (
            <button
              key={w.id}
              type="button"
              role="radio"
              aria-checked={filter.window === w.id}
              className={styles.rateBtn ?? ''}
              onClick={() => {
                onFilter({ ...filter, window: w.id })
              }}
            >
              {w.label}
            </button>
          ))}
        </div>
        <Switch
          label="Hazardous only"
          hint="JPL's “potentially hazardous” list: bigger than about 140 m, on an orbit that comes within 0.05 au of Earth's. A label, not a prediction of a hit."
          on={filter.hazardousOnly}
          onChange={(hazardousOnly) => {
            onFilter({ ...filter, hazardousOnly })
          }}
        />
        <Switch
          label="On ESA's risk list only"
          hint="ESA's list of objects whose orbit, as known today, leaves a tiny modelled chance of a hit within 100 years. Most drop off as observations come in."
          on={filter.riskListedOnly}
          onChange={(riskListedOnly) => {
            onFilter({ ...filter, riskListedOnly })
          }}
        />
        <p className={styles.craftStatus ?? ''} role="status">
          {total > 0 ? `${String(shown)} of ${String(total)} drawn. ` : ''}
          {status}
        </p>
        {ranked.length > 0 && (
          <details className={styles.scout ?? ''}>
            <summary>Just found, unconfirmed (JPL Scout, {scout.length})</summary>
            <p className={styles.switchHint ?? ''}>
              Too new for a confirmed orbit, so no position is drawn. NEO is how likely each is a
              near-Earth object; ± is how far off its position may be on the sky now.
            </p>
            <ul className={styles.scoutList ?? ''}>
              {ranked.map((o) => (
                <li key={o.objectName}>
                  <button
                    type="button"
                    className={styles.scoutItem ?? ''}
                    onClick={() => {
                      onSelect(`scout:${o.objectName}`)
                    }}
                  >
                    <span>{o.objectName}</span>
                    <span>
                      NEO {o.neoScore === null ? '?' : `${String(o.neoScore)}%`} · ±
                      {o.unc === null ? '?' : `${String(o.unc)}′`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className={styles.group ?? ''} aria-labelledby="orrery-weather">
        <h2 id="orrery-weather" className={styles.groupTitle ?? ''}>
          Space weather
        </h2>
        <Switch
          label="Sun–Earth line"
          hint="The line from the Sun to Earth, with L1 on it: the point 1.5 million km sunward where DSCOVR and ACE sample the solar wind before it reaches us."
          on={sunLine}
          onChange={onSunLine}
        />
      </section>
    </>
  )
}
