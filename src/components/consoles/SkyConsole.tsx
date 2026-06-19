import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { ApodCard } from '@/components/panels/ApodCard'
import { PlanetsPanel } from '@/components/panels/PlanetsPanel'
import { SunMoonPanel } from '@/components/panels/SunMoonPanel'
import { SentryPanel } from '@/components/panels/SentryPanel'
import { AsteroidTable } from '@/components/panels/AsteroidTable'
import { FireballList } from '@/components/panels/FireballList'
import styles from './console.module.css'

export function SkyConsole() {
  return (
    <div className={styles.console ?? ''}>
      <div className={styles.intro ?? ''}>
        <span className={styles.introTitle ?? ''}>Sky</span>
        <span className={styles.introSub ?? ''}>Planets · deep space · near-Earth objects</span>
      </div>
      <div className={styles.wide ?? ''}>
        <ErrorBoundary label="APOD">
          <ApodCard />
        </ErrorBoundary>
      </div>
      <ErrorBoundary label="Planets Tonight">
        <PlanetsPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Sun & Moon">
        <SunMoonPanel />
      </ErrorBoundary>
      <div className={styles.wide ?? ''}>
        <ErrorBoundary label="Close Approaches">
          <AsteroidTable />
        </ErrorBoundary>
      </div>
      <ErrorBoundary label="Fireballs">
        <FireballList />
      </ErrorBoundary>
      <ErrorBoundary label="Sentry">
        <SentryPanel />
      </ErrorBoundary>
    </div>
  )
}
