import { lazy, Suspense } from 'react'
import { StatusBar } from '@/components/status-bar/StatusBar'
import { IssPanel } from '@/components/panels/IssPanel'

const WorldMap = lazy(() =>
  import('@/components/world-map/WorldMap').then((m) => ({ default: m.WorldMap })),
)

import { SentryPanel } from '@/components/panels/SentryPanel'
import { AsteroidTable } from '@/components/panels/AsteroidTable'
import { SpaceWeatherStrip } from '@/components/panels/SpaceWeatherStrip'
import { FireballList } from '@/components/panels/FireballList'
import { ApodCard } from '@/components/panels/ApodCard'
import { Ticker } from '@/components/ticker/Ticker'
import { Footer } from '@/components/footer/Footer'
import appStyles from './App.module.css'

export function App() {
  return (
    <>
      <div className="starfield" aria-hidden="true" />

      <StatusBar />

      <main id="main-content" className={appStyles.main ?? ''}>
        <div className={appStyles.grid ?? ''}>
          <div className={appStyles.mapArea ?? ''}>
            <Suspense fallback={null}>
              <WorldMap />
            </Suspense>
          </div>

          <div className={appStyles.issArea ?? ''}>
            <IssPanel />
          </div>

          <div className={appStyles.sentryArea ?? ''}>
            <SentryPanel />
          </div>

          <div className={appStyles.asteroidArea ?? ''}>
            <AsteroidTable />
          </div>

          <div className={appStyles.weatherArea ?? ''}>
            <SpaceWeatherStrip />
          </div>

          <div className={appStyles.fireballArea ?? ''}>
            <FireballList />
          </div>

          <div className={appStyles.apodArea ?? ''}>
            <ApodCard />
          </div>

          <div className={appStyles.footerArea ?? ''}>
            <Footer />
          </div>
        </div>
      </main>

      <Ticker />
    </>
  )
}
