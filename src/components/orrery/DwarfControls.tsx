import styles from './orrery.module.css'
import { Switch } from './Switch'

interface DwarfControlsProps {
  on: boolean
  onChange: (on: boolean) => void
  status: string
}

/**
 * The "Dwarf planets" group (#99 item 8). Off at first: its data (/api/orrery-dwarfs, its
 * own endpoint) loads only when it is switched on or a link asks, so a plain visit to the
 * orrery, or to the Tonight panel, fetches nothing more. The hint says what places them, since phones have no
 * hover (#122).
 */
export function DwarfControls({ on, onChange, status }: DwarfControlsProps) {
  return (
    <section className={styles.group ?? ''} aria-labelledby="orrery-dwarfs">
      <h2 id="orrery-dwarfs" className={styles.groupTitle ?? ''}>
        Dwarf planets
      </h2>
      <Switch
        label="Dwarf planets"
        hint="Pluto, Ceres, Eris, Makemake and Haumea, placed by JPL Horizons. Pluto has data for the whole clock; the other four from 1600 to 2500, and outside that only their orbits are drawn"
        on={on}
        onChange={onChange}
      />
      {status && (
        <p className={styles.craftStatus ?? ''} role="status">
          {status}
        </p>
      )}
    </section>
  )
}
