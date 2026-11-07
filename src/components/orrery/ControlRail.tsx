import { SOURCES } from '@/lib/orrery/sources'

import type { CatalogItem } from './catalog'
import styles from './orrery.module.css'
import { SearchBox } from './SearchBox'
import type { CraftFilter, FocusPreset, ScaleMode, Visibility } from './three/OrreryRenderer'

const PRESETS: { id: FocusPreset; label: string }[] = [
  { id: 'sun', label: 'Sun' },
  { id: 'inner', label: 'Inner' },
  { id: 'outer', label: 'Outer' },
  { id: 'heliosphere', label: 'Heliosphere' },
]
/** Spec Part 10's scale modes; the Earth-orbit one arrives with the Earth frame (#92). */
const SCALES: { id: ScaleMode; label: string; hint: string }[] = [
  { id: 'exaggerated', label: 'Big bodies', hint: 'Log distances, enlarged bodies' },
  { id: 'log', label: 'Log distance', hint: 'Log distances, small bodies' },
  { id: 'proportional', label: 'Proportional', hint: 'True distances; bodies marked' },
]

interface ControlRailProps {
  open: boolean
  visibility: Visibility
  onVisibility: (v: Visibility) => void
  scale: ScaleMode
  onScale: (s: ScaleMode) => void
  preset: FocusPreset | null
  onPreset: (p: FocusPreset) => void
  onSelect: (key: string) => void
  /** What search can find (#93: planets, Moon and craft). */
  items?: readonly CatalogItem[] | undefined
  craftFilter?: CraftFilter | undefined
  onCraftFilter?: ((f: CraftFilter) => void) | undefined
  /** How the craft data is doing: a count once loaded, or why there is none. */
  craftStatus?: string | undefined
  /** Craft in DSN contact now. */
  dsnCount?: number | undefined
}

function Switch({
  label,
  on,
  onChange,
}: {
  label: string
  on: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <div className={styles.switchRow ?? ''}>
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={styles.switch ?? ''}
        onClick={() => {
          onChange(!on)
        }}
      />
    </div>
  )
}

/**
 * The orrery's controls (#91), grouped as in spec Part 19 and showing only the groups
 * that have something in them. Left rail from 900px, a bottom sheet below.
 */
export function ControlRail({
  open,
  visibility,
  onVisibility,
  scale,
  onScale,
  preset,
  onPreset,
  onSelect,
  items,
  craftFilter,
  onCraftFilter,
  craftStatus,
  dsnCount,
}: ControlRailProps) {
  return (
    <div
      id="orrery-controls"
      className={styles.rail ?? ''}
      data-open={open}
      role="region"
      aria-label="Orrery controls"
    >
      <section className={styles.group ?? ''} aria-labelledby="orrery-find">
        <h2 id="orrery-find" className={styles.groupTitle ?? ''}>
          Find
        </h2>
        <SearchBox items={items} onSelect={onSelect} />
      </section>

      <section className={styles.group ?? ''} aria-labelledby="orrery-solar">
        <h2 id="orrery-solar" className={styles.groupTitle ?? ''}>
          Solar system
        </h2>
        <Switch
          label="Planets"
          on={visibility.planets}
          onChange={(planets) => {
            onVisibility({ ...visibility, planets })
          }}
        />
        <Switch
          label="Orbits"
          on={visibility.orbits}
          onChange={(orbits) => {
            onVisibility({ ...visibility, orbits })
          }}
        />
        <Switch
          label="Labels"
          on={visibility.labels}
          onChange={(labels) => {
            onVisibility({ ...visibility, labels })
          }}
        />
      </section>

      {craftFilter && onCraftFilter && (
        <section className={styles.group ?? ''} aria-labelledby="orrery-craft">
          <h2 id="orrery-craft" className={styles.groupTitle ?? ''}>
            Spacecraft
          </h2>
          <Switch
            label="Deep space"
            on={craftFilter['deep-space']}
            onChange={(on) => {
              onCraftFilter({ ...craftFilter, 'deep-space': on })
            }}
          />
          <Switch
            label="Missions"
            on={craftFilter.mission}
            onChange={(mission) => {
              onCraftFilter({ ...craftFilter, mission })
            }}
          />
          <Switch
            label="L1 & L2 observatories"
            on={craftFilter.l1}
            onChange={(l1) => {
              onCraftFilter({ ...craftFilter, l1 })
            }}
          />
          <Switch
            label={`Only in DSN contact (${String(dsnCount ?? 0)})`}
            on={craftFilter.dsnOnly}
            onChange={(dsnOnly) => {
              onCraftFilter({ ...craftFilter, dsnOnly })
            }}
          />
          {craftStatus && (
            <p className={styles.craftStatus ?? ''} role="status">
              {craftStatus}
            </p>
          )}
        </section>
      )}

      <section className={styles.group ?? ''} aria-labelledby="orrery-view">
        <h2 id="orrery-view" className={styles.groupTitle ?? ''}>
          View
        </h2>
        <div className={styles.chipRow ?? ''} role="group" aria-label="Focus">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={styles.chipBtn ?? ''}
              aria-pressed={preset === p.id}
              onClick={() => {
                onPreset(p.id)
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            className={styles.chipBtn ?? ''}
            disabled
            title="Arrives with the Earth frame (#92)"
          >
            Earth–Moon
          </button>
          <button
            type="button"
            className={styles.chipBtn ?? ''}
            disabled
            title="Arrives with the satellites (#98)"
          >
            Earth orbit
          </button>
        </div>
        <div className={styles.chipRow ?? ''} role="radiogroup" aria-label="Scale">
          {SCALES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={scale === s.id}
              title={s.hint}
              className={styles.rateBtn ?? ''}
              onClick={() => {
                onScale(s.id)
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <details className={styles.group ?? ''}>
        <summary className={styles.groupTitle ?? ''}>Data sources</summary>
        <ul className={styles.sources ?? ''}>
          {SOURCES.map((s) => (
            <li key={s.id} className={styles.source ?? ''}>
              <a href={s.docs} target="_blank" rel="noreferrer">
                {s.name}
              </a>
              <span className={styles.status ?? ''} data-status={s.status}>
                {s.status}
              </span>
              {s.note && <span className={styles.sourceNote ?? ''}>{s.note}</span>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
