import { DsnPanel } from '@/components/panels/DsnPanel'
import { LaunchPanel } from '@/components/panels/LaunchPanel'
import { PeopleInSpacePanel } from '@/components/panels/PeopleInSpacePanel'
import { SpaceNewsPanel } from '@/components/panels/SpaceNewsPanel'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

import styles from './console.module.css'

/** Beside the tracking globe (#63): who is up there and who is listening. */
export function OrbitConsoleLead() {
  return (
    <>
      <ErrorBoundary label="Humans in Orbit">
        <PeopleInSpacePanel />
      </ErrorBoundary>
      <ErrorBoundary label="Deep Space Network">
        <DsnPanel />
      </ErrorBoundary>
    </>
  )
}

export function OrbitConsoleRest() {
  return (
    <>
      <div className={styles.wide ?? ''}>
        <ErrorBoundary label="Launches">
          <LaunchPanel />
        </ErrorBoundary>
      </div>
      <div className={styles.wide ?? ''}>
        <ErrorBoundary label="Mission Intel">
          <SpaceNewsPanel />
        </ErrorBoundary>
      </div>
    </>
  )
}
