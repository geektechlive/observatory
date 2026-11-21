import type { NeoFilter, NeoWindow } from '@/lib/orrery/asteroids'
import type { ScoutObject } from '@/schemas/orreryNeo'

import { FoldGroup } from './FoldGroup'
import styles from './orrery.module.css'
import { Switch } from './Switch'

const WINDOWS: { id: NeoWindow; label: string }[] = [
  { id: 'day', label: 'Within a day' },
  { id: 'week', label: 'Within a week' },
  { id: 'month', label: 'Within 30 days' },
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

const SUN_LINE = 'Sun–Earth line'

/**
 * The Near Earth group of the controls (#92; spec Parts 12 and 19; one folding group with
 * the Sun–Earth line since #273): close approaches with their filters, JPL Scout's
 * unconfirmed objects, and the line. Each term has a one-line hint, since phones have no
 * hover (#122); the guide holds the longer story.
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
    <FoldGroup
      id="near"
      title="Near Earth"
      readout={total > 0 ? `${String(shown)} drawn` : sunLine ? 'Sun line on' : 'Off'}
      off={total === 0 && !sunLine}
      onKeys={sunLine ? [SUN_LINE] : []}
    >
      <p className={styles.switchHint ?? ''}>
        Asteroids passing within 0.05 au of Earth, 30 days either side of today.
      </p>
      <div className={styles.chipRow ?? ''} role="group" aria-label="Closest approach">
        {WINDOWS.map((w) => (
          <button
            key={w.id}
            type="button"
            aria-pressed={filter.window === w.id}
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
        hint="JPL’s “potentially hazardous” list, not a forecast of a hit"
        on={filter.hazardousOnly}
        onChange={(hazardousOnly) => {
          onFilter({ ...filter, hazardousOnly })
        }}
      />
      <Switch
        label="On ESA's risk list only"
        hint="A tiny modelled chance of a hit within 100 years"
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
      <Switch
        label={SUN_LINE}
        hint="Marks L1, where DSCOVR and ACE watch the solar wind"
        on={sunLine}
        onChange={onSunLine}
      />
    </FoldGroup>
  )
}
