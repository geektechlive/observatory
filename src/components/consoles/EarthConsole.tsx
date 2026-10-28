import { GeomagKpPanel } from '@/components/panels/GeomagKpPanel'
import { NwsAlertsPanel } from '@/components/panels/NwsAlertsPanel'
import { SeismicPanel } from '@/components/panels/SeismicPanel'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

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
