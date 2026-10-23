import { CmePanel } from '@/components/panels/CmePanel'
import { GeomagPanel } from '@/components/panels/GeomagPanel'
import { SolarActivityPanel } from '@/components/panels/SolarActivityPanel'
import { SolarCyclePanel } from '@/components/panels/SolarCyclePanel'
import { SolarWindPanel } from '@/components/panels/SolarWindPanel'
import { SpaceWeatherStrip } from '@/components/panels/SpaceWeatherStrip'
import { SunImageryPanel } from '@/components/panels/SunImageryPanel'
import { SwpcAlertsPanel } from '@/components/panels/SwpcAlertsPanel'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

import styles from './console.module.css'

/** Beside the Sun stage (#63): activity, wind and the geomagnetic response. */
export function SunConsoleLead() {
  return (
    <>
      <ErrorBoundary label="Solar Activity">
        <SolarActivityPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Solar Wind">
        <SolarWindPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Geomagnetic">
        <GeomagPanel />
      </ErrorBoundary>
    </>
  )
}

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
