import { boxscoreLine } from '@/lib/satcatWords'

import styles from './orrery.module.css'
import { SAT_TOGGLES, type SatToggles } from './satToggles'
import { Switch } from './Switch'

interface SatControlsProps {
  toggles: SatToggles
  onToggles: (t: SatToggles) => void
  /** What is loaded and how old, or why nothing is (satStatusText). */
  status: string
  /** Space-Track's Box Score totals (#101), once fetched. */
  boxscore?:
    | { inOrbit: { payload: number; rocketBody: number; debris: number; total: number } }
    | null
    | undefined
  /** How many objects Space-Track predicts will re-enter in the next 7 days (#101). */
  reentriesThisWeek?: number | undefined
}

/**
 * The Earth orbit group of the controls (#98; spec Part 19): a switch per kind of
 * satellite, each explained in place since phones have no hover (#122). Below them,
 * Space-Track's count of everything in orbit and this week's re-entries (#101).
 */
export function SatControls({
  toggles,
  onToggles,
  status,
  boxscore,
  reentriesThisWeek = 0,
}: SatControlsProps) {
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
      {reentriesThisWeek > 0 && (
        <p className={styles.switchHint ?? ''} data-reentries={reentriesThisWeek}>
          {reentriesThisWeek === 1
            ? '1 object is predicted to re-enter in the next 7 days'
            : `${String(reentriesThisWeek)} objects are predicted to re-enter in the next 7 days`}
          , ringed in amber when its group is on (Space-Track.org TIP messages).
        </p>
      )}
      {boxscore && <p className={styles.switchHint ?? ''}>{boxscoreLine(boxscore)}</p>}
    </section>
  )
}
