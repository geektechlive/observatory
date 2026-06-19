import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { SunImageryPanel } from '@/components/panels/SunImageryPanel'
import { SolarActivityPanel } from '@/components/panels/SolarActivityPanel'
import { SolarWindPanel } from '@/components/panels/SolarWindPanel'
import { SpaceWeatherStrip } from '@/components/panels/SpaceWeatherStrip'
import { SolarCyclePanel } from '@/components/panels/SolarCyclePanel'
import styles from './console.module.css'

export function SunConsole() {
  return (
    <div className={styles.console ?? ''}>
      <div className={styles.intro ?? ''}>
        <span className={styles.introTitle ?? ''}>Sun</span>
        <span className={styles.introSub ?? ''}>Heliophysics · space weather · forecast</span>
      </div>
      <ErrorBoundary label="Live Sun">
        <SunImageryPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Solar Activity">
        <SolarActivityPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Solar Wind">
        <SolarWindPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Space Weather">
        <SpaceWeatherStrip />
      </ErrorBoundary>
      <div className={styles.full ?? ''}>
        <ErrorBoundary label="Solar Cycle 25">
          <SolarCyclePanel />
        </ErrorBoundary>
      </div>
    </div>
  )
}
