import { lazy, Suspense, useCallback, useRef, useState } from 'react'

import { CONSOLE_PARTS } from '@/components/consoles/consoleParts'
import { ConsoleVoice } from '@/components/consoles/ConsoleVoice'
import { Footer } from '@/components/footer/Footer'
import { GlobeHost } from '@/components/globe/GlobeHost'
import { LayerControl } from '@/components/globe/LayerControl'
import { IssPlate, type MapMode } from '@/components/lens/IssPlate'
import { SubsolarPlate, type SubsolarPlateHandle } from '@/components/lens/SubsolarPlate'
import { OrbitalDial } from '@/components/nav/OrbitalDial'
import { SkyStage } from '@/components/stage/SkyStage'
import { SunStage } from '@/components/stage/SunStage'
import { StarField } from '@/components/starfield/StarField'
import { HeaderPlate } from '@/components/status-bar/HeaderPlate'
import { Ticker } from '@/components/ticker/Ticker'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { useGlobeData } from '@/hooks/useGlobeData'
import { useHashView } from '@/hooks/useHashView'
import { useLensSize } from '@/hooks/useLensSize'
import { useUiStore } from '@/store/ui'

import styles from './App.module.css'
import consoleStyles from './components/consoles/console.module.css'

const WorldMap = lazy(() =>
  import('@/components/world-map/WorldMap').then((m) => ({ default: m.WorldMap })),
)

/**
 * The page (#63), laid out like the approved ROCI v2 prototype: a header plate, then
 * the dial rail, the lens (the instrument) and the console column, with the rest of
 * the console's panels below. On phones the dial is a fixed bar above the ticker.
 */
export function App() {
  useHashView()
  const view = useUiStore((s) => s.view)
  const [mapMode, setMapMode] = useState<MapMode>('globe')
  const { globeProps, census, issPos, issIntervalMs } = useGlobeData()

  const lens = useRef<HTMLElement>(null)
  const size = useLensSize(lens)
  const subsolar = useRef<SubsolarPlateHandle>(null)
  const onFacing = useCallback((lon: number) => {
    subsolar.current?.setFacing(lon)
  }, [])

  const stageKind = view === 'sun' ? 'sun' : view === 'sky' ? 'sky' : 'globe'
  const parts = CONSOLE_PARTS[view]

  return (
    <>
      <StarField />
      <div className={styles.page ?? ''}>
        <HeaderPlate />

        <main id="main-content" className={styles.main ?? ''}>
          <div className={styles.dial ?? ''}>
            <OrbitalDial />
          </div>

          <section ref={lens} className={styles.lens ?? ''} aria-label="Instrument">
            <div
              className={styles.stage ?? ''}
              data-stage={stageKind === 'globe' ? mapMode : stageKind}
            >
              {stageKind === 'globe' && (
                <div className={styles.layers ?? ''}>
                  <LayerControl showMapLayers={mapMode === 'map'} />
                </div>
              )}
              <div className={styles.stageMorph ?? ''} key={stageKind}>
                {stageKind === 'sun' ? (
                  <SunStage size={size} />
                ) : stageKind === 'sky' ? (
                  <SkyStage size={size} />
                ) : mapMode === 'globe' ? (
                  <GlobeHost
                    size={size}
                    {...globeProps}
                    autoRotate={true}
                    census={census}
                    onFacing={onFacing}
                  />
                ) : (
                  <Suspense fallback={null}>
                    <WorldMap />
                  </Suspense>
                )}
              </div>
            </div>

            {stageKind === 'globe' && (
              <div className={styles.plates ?? ''}>
                {mapMode === 'globe' ? <SubsolarPlate ref={subsolar} /> : <span />}
                <IssPlate
                  lat={issPos?.lat}
                  lon={issPos?.lon}
                  altKm={issPos?.alt}
                  velKmH={issPos?.vel}
                  intervalMs={issIntervalMs}
                  mapMode={mapMode}
                  onMapMode={setMapMode}
                />
              </div>
            )}
          </section>

          <ErrorBoundary label="Console">
            {/* OrbitalDial's tabs (id console-tab-<view>) control this panel. */}
            <section
              id="console-panel"
              role="tabpanel"
              aria-labelledby={`console-tab-${view}`}
              className={`${styles.console ?? ''} ${consoleStyles.lead ?? ''}`}
              key={`lead-${view}`}
            >
              <ConsoleVoice view={view} />
              <p className={consoleStyles.sub ?? ''}>{parts.sub}</p>
              <parts.Lead />
            </section>
          </ErrorBoundary>

          <ErrorBoundary label="More panels">
            <section
              aria-label={`More ${view} panels`}
              className={`${styles.rest ?? ''} ${consoleStyles.rest ?? ''}`}
              key={`rest-${view}`}
            >
              <Suspense fallback={null}>
                <parts.Rest />
              </Suspense>
            </section>
          </ErrorBoundary>

          <div className={styles.footer ?? ''}>
            <Footer />
          </div>
        </main>
      </div>

      <ErrorBoundary>
        <Ticker />
      </ErrorBoundary>
    </>
  )
}
