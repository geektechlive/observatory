// Below the lens row, so it loads in its own chunk after first paint (#75).
import { Co2Panel } from '@/components/panels/Co2Panel'
import { EpicPanel } from '@/components/panels/EpicPanel'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

import styles from './console.module.css'

/** Below the globe: the rest of the Earth console. */
export function EarthConsoleRest() {
  return (
    <>
      <div className={styles.wide ?? ''}>
        <ErrorBoundary label="EPIC">
          <EpicPanel />
        </ErrorBoundary>
      </div>
      <ErrorBoundary label="Atmospheric CO₂">
        <Co2Panel />
      </ErrorBoundary>
    </>
  )
}
