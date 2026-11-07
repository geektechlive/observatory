import styles from './orrery.module.css'
import { SAT_TOGGLES, type SatToggles } from './satToggles'
import { Switch } from './Switch'

interface SatControlsProps {
  toggles: SatToggles
  onToggles: (t: SatToggles) => void
  /** What is loaded and how old, or why nothing is (satStatusText). */
  status: string
}

/**
 * The Earth orbit group of the controls (#98; spec Part 19): a switch per kind of
 * satellite, each explained in place since phones have no hover (#122).
 */
export function SatControls({ toggles, onToggles, status }: SatControlsProps) {
  return (
    <section className={styles.group ?? ''} aria-labelledby="orrery-sats">
      <h2 id="orrery-sats" className={styles.groupTitle ?? ''}>
        Earth orbit
      </h2>
      {SAT_TOGGLES.map((t) => (
        <Switch
          key={t.id}
          label={t.label}
          hint={t.hint}
          on={toggles[t.id]}
          onChange={(on) => {
            onToggles({ ...toggles, [t.id]: on })
          }}
        />
      ))}
      <p className={styles.craftStatus ?? ''} role="status">
        {status}
      </p>
    </section>
  )
}
