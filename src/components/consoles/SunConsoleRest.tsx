// Below the lens row, so it loads in its own chunk after first paint (#75).
import { CmePanel } from '@/components/panels/CmePanel'
import { SolarCyclePanel } from '@/components/panels/SolarCyclePanel'
import { SpaceWeatherStrip } from '@/components/panels/SpaceWeatherStrip'
import { SunImageryPanel } from '@/components/panels/SunImageryPanel'
import { SwpcAlertsPanel } from '@/components/panels/SwpcAlertsPanel'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

import styles from './console.module.css'

export function SunConsoleRest() {
  return (
    <>
      <ErrorBoundary label="CME Watch">
        <CmePanel />
      </ErrorBoundary>
      <ErrorBoundary label="Solar Imagery">
        <SunImageryPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Space Weather">
        <SpaceWeatherStrip />
      </ErrorBoundary>
      <ErrorBoundary label="SWPC Alerts">
        <SwpcAlertsPanel />
      </ErrorBoundary>
      <div className={styles.full ?? ''}>
        <ErrorBoundary label="Solar Cycle 25">
          <SolarCyclePanel />
        </ErrorBoundary>
      </div>
    </>
  )
}
