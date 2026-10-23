import { ApodCard } from '@/components/panels/ApodCard'
import { AsteroidTable } from '@/components/panels/AsteroidTable'
import { ExoplanetPanel } from '@/components/panels/ExoplanetPanel'
import { FireballList } from '@/components/panels/FireballList'
import { MarsWeatherPanel } from '@/components/panels/MarsWeatherPanel'
import { PlanetsPanel } from '@/components/panels/PlanetsPanel'
import { SentryPanel } from '@/components/panels/SentryPanel'
import { SunMoonPanel } from '@/components/panels/SunMoonPanel'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

import styles from './console.module.css'

/** Beside the sky dome (#63): tonight's planets, Sun and Moon, and close approaches. */
export function SkyConsoleLead() {
  return (
    <>
      <ErrorBoundary label="Planets Tonight">
        <PlanetsPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Sun & Moon">
        <SunMoonPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Sentry">
        <SentryPanel />
      </ErrorBoundary>
    </>
  )
}

export function SkyConsoleRest() {
  return (
    <>
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
