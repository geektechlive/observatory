import { GeomagPanel } from '@/components/panels/GeomagPanel'
import { SolarActivityPanel } from '@/components/panels/SolarActivityPanel'
import { SolarWindPanel } from '@/components/panels/SolarWindPanel'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

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
