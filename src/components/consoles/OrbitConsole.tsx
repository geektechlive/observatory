import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { LaunchPanel } from '@/components/panels/LaunchPanel'
import { PeopleInSpacePanel } from '@/components/panels/PeopleInSpacePanel'
import { DsnPanel } from '@/components/panels/DsnPanel'
import styles from './console.module.css'

export function OrbitConsole() {
  return (
    <div className={styles.console ?? ''}>
      <div className={styles.intro ?? ''}>
        <span className={styles.introTitle ?? ''}>Orbit</span>
        <span className={styles.introSub ?? ''}>Launches · crews · deep-space comms</span>
      </div>
      <div className={styles.wide ?? ''}>
        <ErrorBoundary label="Launches">
          <LaunchPanel />
        </ErrorBoundary>
      </div>
      <ErrorBoundary label="Humans in Orbit">
        <PeopleInSpacePanel />
      </ErrorBoundary>
      <ErrorBoundary label="Deep Space Network">
        <DsnPanel />
      </ErrorBoundary>
    </div>
  )
}
