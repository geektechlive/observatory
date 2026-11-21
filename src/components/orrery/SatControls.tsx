import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'

import { boxscoreLine } from '@/lib/satcatWords'

import { FoldGroup } from './FoldGroup'
import styles from './orrery.module.css'
import { countReadout } from './railFolds'
import type { SatBrowserProps } from './SatBrowser'
import { SAT_TOGGLES, type SatToggles } from './satToggles'
import { Switch } from './Switch'

/** The satellite browser (#158) is its own chunk, fetched when it is first opened (#162). */
const SatBrowser = lazy(() => import('./SatBrowser').then((m) => ({ default: m.SatBrowser })))

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
  /** What the satellite browser needs (#158); without it there is no Browse button. */
  browse?: Omit<SatBrowserProps, 'toggles' | 'onToggles'> | undefined
}

/**
 * The Earth orbit group of the controls (#98; spec Part 19; folds since #273): a switch
 * per kind of satellite, each with a one-line hint since phones have no hover (#122); the
 * satellite browser and the guide carry the longer ones. Below them,
 * Space-Track's count of everything in orbit and this week's re-entries (#101).
 */
export function SatControls({
  toggles,
  onToggles,
  status,
  boxscore,
  reentriesThisWeek = 0,
  browse,
}: SatControlsProps) {
  const on = SAT_TOGGLES.filter((t) => toggles[t.id]).map((t) => t.label)
  const [browsing, setBrowsing] = useState(false)
  const panelId = useId()
  const panel = useRef<HTMLDivElement>(null)
  // The list sits below the switches in a scrolling rail: bring it into view on opening.
  useEffect(() => {
    if (browsing) panel.current?.scrollIntoView({ block: 'start' })
  }, [browsing])
  return (
    <FoldGroup
      id="orbit"
      title="Earth orbit"
      readout={countReadout(on.length, SAT_TOGGLES.length)}
      off={on.length === 0}
      onKeys={on}
    >
      {SAT_TOGGLES.map((t) => (
        <Switch
          key={t.id}
          label={t.label}
          hint={t.short}
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
          , ringed in amber and named on the stage (Space-Track.org TIP messages).
        </p>
      )}
      {boxscore && <p className={styles.switchHint ?? ''}>{boxscoreLine(boxscore)}</p>}
      {browse && (
        <>
          <button
            type="button"
            className={styles.chipBtn ?? ''}
            aria-expanded={browsing}
            aria-controls={panelId}
            onClick={() => {
              setBrowsing((b) => !b)
            }}
          >
            {browsing ? 'Close the satellite browser' : 'Browse satellites'}
          </button>
          <p className={styles.switchHint ?? ''}>
            Find satellites without knowing a name: by kind, orbit, launch date and more.
          </p>
          <div id={panelId} ref={panel}>
            {browsing && (
              <Suspense fallback={<p className={styles.switchHint ?? ''}>Loading the browser…</p>}>
                <SatBrowser {...browse} toggles={toggles} onToggles={onToggles} />
              </Suspense>
            )}
          </div>
        </>
      )}
    </FoldGroup>
  )
}
