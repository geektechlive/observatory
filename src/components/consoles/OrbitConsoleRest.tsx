// Below the lens row, so it loads in its own chunk after first paint (#75).
import { LaunchPanel } from '@/components/panels/LaunchPanel'
import { SpaceNewsPanel } from '@/components/panels/SpaceNewsPanel'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

import styles from './console.module.css'

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
