import styles from './orrery.module.css'
import { Switch } from './Switch'
import type { SmallBodyGroups } from './three/OrreryRenderer'

interface SmallBodyControlsProps {
  groups: SmallBodyGroups
  onGroups: (g: SmallBodyGroups) => void
  status: string
  /** The "Bright asteroids" switch's status line (#99 item 4). */
  asteroidStatus?: string
}

/**
 * The "Comets, asteroids & interstellar" group (#99). All start off: the data loads only
 * when one is switched on. Each term is explained in place, since phones have no hover (#122).
 */
export function SmallBodyControls({
  groups,
  onGroups,
  status,
  asteroidStatus = '',
}: SmallBodyControlsProps) {
  return (
    <section className={styles.group ?? ''} aria-labelledby="orrery-small-bodies">
      <h2 id="orrery-small-bodies" className={styles.groupTitle ?? ''}>
        Comets, asteroids & interstellar
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
        label="Bright asteroids"
        hint="The asteroids JPL’s H and G estimate to be brightest at the last refresh (about magnitude 11.5 or brighter); Ceres is drawn only by the Dwarf planets switch, though the Sky view lists it. Each is placed from daily JPL samples for about a week around the refresh and is hidden outside it; its orbit line is drawn from its orbital elements"
        on={groups.asteroids}
        onChange={(asteroids) => {
          onGroups({ ...groups, asteroids })
        }}
      />
      {asteroidStatus && (
        <p className={styles.craftStatus ?? ''} role="status">
          {asteroidStatus}
        </p>
      )}
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
