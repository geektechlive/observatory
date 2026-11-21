import { FoldGroup } from './FoldGroup'
import styles from './orrery.module.css'
import { countReadout } from './railFolds'
import { Switch } from './Switch'
import type { SmallBodyGroups } from './three/OrreryRenderer'

interface SmallBodyControlsProps {
  groups: SmallBodyGroups
  onGroups: (g: SmallBodyGroups) => void
  status: string
  /** The "Bright asteroids" switch's status line (#99 item 4). */
  asteroidStatus?: string
  /** The "Dwarf planets" switch's status line (#99 item 8). */
  dwarfStatus?: string
}

const LABELS = {
  dwarfs: 'Dwarf planets',
  comets: 'Comets',
  asteroids: 'Bright asteroids',
  interstellar: 'Interstellar objects',
} as const satisfies Record<keyof SmallBodyGroups, string>

const ORDER = ['dwarfs', 'comets', 'asteroids', 'interstellar'] as const

/**
 * The "Small bodies" group (#99; merged from the dwarf planets and the comets, asteroids
 * and interstellar groups in #273). All start off: each one's data loads only when it is
 * switched on or a link asks. Each switch has a one-line hint, since phones have no hover
 * (#122); the guide holds the longer story.
 */
export function SmallBodyControls({
  groups,
  onGroups,
  status,
  asteroidStatus = '',
  dwarfStatus = '',
}: SmallBodyControlsProps) {
  const on = ORDER.filter((k) => groups[k]).map((k) => LABELS[k])
  const toggle = (key: keyof SmallBodyGroups) => (value: boolean) => {
    onGroups({ ...groups, [key]: value })
  }
  return (
    <FoldGroup
      id="small"
      title="Small bodies"
      readout={countReadout(on.length, ORDER.length)}
      off={on.length === 0}
      onKeys={on}
    >
      <Switch
        label={LABELS.dwarfs}
        hint="Pluto, Ceres, Eris, Makemake and Haumea"
        on={groups.dwarfs}
        onChange={toggle('dwarfs')}
      />
      {dwarfStatus && (
        <p className={styles.craftStatus ?? ''} role="status">
          {dwarfStatus}
        </p>
      )}
      <Switch
        label={LABELS.comets}
        hint="The comets JPL forecasts brightest tonight"
        on={groups.comets}
        onChange={toggle('comets')}
      />
      <Switch
        label={LABELS.asteroids}
        hint="The brightest asteroids, per JPL"
        on={groups.asteroids}
        onChange={toggle('asteroids')}
      />
      {asteroidStatus && (
        <p className={styles.craftStatus ?? ''} role="status">
          {asteroidStatus}
        </p>
      )}
      <Switch
        label={LABELS.interstellar}
        hint="ʻOumuamua, Borisov and 3I/ATLAS, from other stars"
        on={groups.interstellar}
        onChange={toggle('interstellar')}
      />
      {status && (
        <p className={styles.craftStatus ?? ''} role="status">
          {status}
        </p>
      )}
    </FoldGroup>
  )
}
