// Below the lens row, so it loads in its own chunk after first paint (#75).
import { ApodCard } from '@/components/panels/ApodCard'
import { AsteroidTable } from '@/components/panels/AsteroidTable'
import { ExoplanetPanel } from '@/components/panels/ExoplanetPanel'
import { FireballList } from '@/components/panels/FireballList'
import { MarsWeatherPanel } from '@/components/panels/MarsWeatherPanel'
import { SkyViewPanel } from '@/components/panels/SkyViewPanel'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

import styles from './console.module.css'

export function SkyConsoleRest() {
  return (
    <>
      {/* Shows only for a #sky?target= link (a Tonight row, the orrery's inspector). */}
      <ErrorBoundary label="Sky view">
        <SkyViewPanel className={styles.wide ?? ''} />
      </ErrorBoundary>
      <div className={styles.wide ?? ''}>
        <ErrorBoundary label="APOD">
          <ApodCard />
        </ErrorBoundary>
      </div>
      <div className={styles.wide ?? ''}>
        <ErrorBoundary label="Close Approaches">
          <AsteroidTable />
        </ErrorBoundary>
      </div>
      <ErrorBoundary label="Fireballs">
        <FireballList />
      </ErrorBoundary>
      <ErrorBoundary label="Mars Weather">
        <MarsWeatherPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Exoplanets">
        <ExoplanetPanel />
      </ErrorBoundary>
    </>
  )
}
