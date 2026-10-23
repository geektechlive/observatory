import { Co2Panel } from '@/components/panels/Co2Panel'
import { EpicPanel } from '@/components/panels/EpicPanel'
import { GeomagKpPanel } from '@/components/panels/GeomagKpPanel'
import { NwsAlertsPanel } from '@/components/panels/NwsAlertsPanel'
import { SeismicPanel } from '@/components/panels/SeismicPanel'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

import styles from './console.module.css'

/** Beside the globe (#63): the prototype's three Earth panels. */
export function EarthConsoleLead() {
  return (
    <>
      <ErrorBoundary label="Seismic">
        <SeismicPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Geomagnetic">
        <GeomagKpPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Weather alerts">
        <NwsAlertsPanel />
      </ErrorBoundary>
    </>
  )
}

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
