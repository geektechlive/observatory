import styles from './orrery.module.css'
import { Switch } from './Switch'
import type { SmallBodyGroups } from './three/OrreryRenderer'

interface SmallBodyControlsProps {
  groups: SmallBodyGroups
  onGroups: (g: SmallBodyGroups) => void
  status: string
}

/**
 * The "Comets & interstellar" group (#99). Both start off: the data loads only when one
 * is switched on. Each term is explained in place, since phones have no hover (#122).
 */
export function SmallBodyControls({ groups, onGroups, status }: SmallBodyControlsProps) {
  return (
    <section className={styles.group ?? ''} aria-labelledby="orrery-small-bodies">
      <h2 id="orrery-small-bodies" className={styles.groupTitle ?? ''}>
        Comets & interstellar
      </h2>
      <Switch
        label="Comets"
        hint="The comets JPL forecasts brightest tonight. Each is placed for ±30 days of today; its orbit line is drawn from its orbital elements"
        on={groups.comets}
        onChange={(comets) => {
          onGroups({ ...groups, comets })
        }}
      />
      <Switch
        label="Interstellar objects"
        hint="ʻOumuamua, Borisov and 3I/ATLAS: visitors from other stars, on paths the Sun cannot hold"
        on={groups.interstellar}
        onChange={(interstellar) => {
          onGroups({ ...groups, interstellar })
        }}
      />
      {status && (
        <p className={styles.craftStatus ?? ''} role="status">
          {status}
        </p>
      )}
    </section>
  )
}
