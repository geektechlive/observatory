import type { ReactNode, Ref } from 'react'

import { SOURCES } from '@/lib/orrery/sources'

import type { CatalogItem } from './catalog'
import styles from './orrery.module.css'
import { SearchBox } from './SearchBox'
import { Switch } from './Switch'
import type { CraftFilter, FocusPreset, ScaleMode, Visibility } from './three/OrreryRenderer'

const PRESETS: { id: FocusPreset; label: string }[] = [
  { id: 'sun', label: 'Sun' },
  { id: 'inner', label: 'Inner' },
  { id: 'outer', label: 'Outer' },
  { id: 'heliosphere', label: 'Heliosphere' },
  { id: 'earth', label: 'Earth–Moon' },
  { id: 'orbit', label: 'Earth orbit' },
]
/**
 * Spec Part 10's scale modes. Near Earth the Earth frame (#92) takes over on its own as you
 * zoom in, and inside geostationary orbit it is true scale, which is the Earth-orbit
 * scale the satellites (#98) are drawn at.
 */
const SCALES: { id: ScaleMode; label: string; hint: string }[] = [
  { id: 'exaggerated', label: 'Big bodies', hint: 'Log distances, enlarged bodies' },
  { id: 'log', label: 'Log distance', hint: 'Log distances, small bodies' },
  { id: 'proportional', label: 'Proportional', hint: 'True distances; bodies marked' },
]

interface ControlRailProps {
  open: boolean
  /** The guide drawer (#159): whether it is open, how to open it, and its button's ref. */
  guideOpen?: boolean | undefined
  onGuide?: (() => void) | undefined
  guideRef?: Ref<HTMLButtonElement> | undefined
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
  /** The near-Earth groups (#92): close approaches, Scout, the Sun–Earth line. */
  nearEarth?: ReactNode
  /** The Earth orbit group (#98): the satellite switches. */
  earthOrbit?: ReactNode
}

/**
 * The orrery's controls (#91), grouped as in spec Part 19 and showing only the groups
 * that have something in them. Left rail from 900px, a bottom sheet below.
 */
export function ControlRail({
  open,
  guideOpen,
  onGuide,
  guideRef,
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
  nearEarth,
  earthOrbit,
}: ControlRailProps) {
  return (
    <div
      id="orrery-controls"
      className={styles.rail ?? ''}
      data-open={open}
      role="region"
      aria-label="Orrery controls"
    >
      {onGuide && (
        <section className={styles.group ?? ''} aria-labelledby="orrery-guide-group">
          <h2 id="orrery-guide-group" className={styles.groupTitle ?? ''}>
            Learn
          </h2>
          <button
            ref={guideRef}
            type="button"
            className={styles.chipBtn ?? ''}
            aria-expanded={guideOpen === true}
            aria-controls="orrery-guide"
            onClick={onGuide}
          >
            Guide
          </button>
        </section>
      )}

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
            hint="Voyager 1, Voyager 2 and New Horizons, beyond the planets"
            on={craftFilter['deep-space']}
            onChange={(on) => {
              onCraftFilter({ ...craftFilter, 'deep-space': on })
            }}
          />
          <Switch
            label="Missions"
            hint="Parker, Juno, Europa Clipper, Psyche, Lucy, Solar Orbiter and BepiColombo, on their way or at work"
            on={craftFilter.mission}
            onChange={(mission) => {
              onCraftFilter({ ...craftFilter, mission })
            }}
          />
          <Switch
            label="L1 & L2 observatories"
            hint="JWST, SOHO, DSCOVR, ACE and Wind, parked about 1.5 million km from Earth"
            on={craftFilter.l1}
            onChange={(l1) => {
              onCraftFilter({ ...craftFilter, l1 })
            }}
          />
          <Switch
            label={`Only those talking to Earth now (${String(dsnCount ?? 0)})`}
            hint="In radio contact with NASA's Deep Space Network: the big dishes at Goldstone, Madrid and Canberra"
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

      {nearEarth}

      {earthOrbit}

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
        </div>
        <div className={styles.chipRow ?? ''} role="group" aria-label="Scale">
          {SCALES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={scale === s.id}
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
