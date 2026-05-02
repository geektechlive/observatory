import { lazy, Suspense, useState } from 'react'
import { useCountUp } from '@/hooks/useCountUp'
import { BelterHeader } from '@/components/status-bar/BelterHeader'
import { HazardChevron } from '@/components/ui/HazardChevron'
import { StarField } from '@/components/starfield/StarField'
import { Globe } from '@/components/globe/Globe'
import { SentryPanel } from '@/components/panels/SentryPanel'
import { AsteroidTable } from '@/components/panels/AsteroidTable'
import { SpaceWeatherStrip } from '@/components/panels/SpaceWeatherStrip'
import { FireballList } from '@/components/panels/FireballList'
import { SolarWindPanel } from '@/components/panels/SolarWindPanel'
import { LaunchPanel } from '@/components/panels/LaunchPanel'
import { Ticker } from '@/components/ticker/Ticker'
import { Footer } from '@/components/footer/Footer'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { useIss } from '@/hooks/useIss'
import { useEvents } from '@/hooks/useEvents'
import { useLaunches } from '@/hooks/useLaunches'
import { useNeo } from '@/hooks/useNeo'
import { isPointGeometry } from '@/schemas/eonet'
import appStyles from './App.module.css'

const WorldMap = lazy(() =>
  import('@/components/world-map/WorldMap').then((m) => ({ default: m.WorldMap })),
)

type MapMode = 'globe' | 'map'

const RIVET_POSITIONS: { top?: number; bottom?: number; left?: number; right?: number }[] = [
  { top: 14, left: 14 },
  { top: 14, right: 14 },
  { bottom: 14, left: 14 },
  { bottom: 14, right: 14 },
]

export function App() {
  const [mapMode, setMapMode] = useState<MapMode>('globe')
  const { position: issPos, trail: issTrail } = useIss()
  const { data: eventsData } = useEvents()
  const { data: launchData } = useLaunches()
  const { data: neoData } = useNeo()

  const globeEvents = (eventsData?.events ?? []).flatMap((ev) => {
    const geom = ev.geometry.find(isPointGeometry)
    if (!geom) return []
    const kind = ev.categories[0]?.id ?? 'other'
    return [{ lat: geom.coordinates[1] ?? 0, lon: geom.coordinates[0] ?? 0, kind }]
  })

  const launchMarkers = (launchData?.result ?? []).flatMap((launch) => {
    const lat = parseFloat(launch.pad?.latitude ?? '')
    const lon = parseFloat(launch.pad?.longitude ?? '')
    if (isNaN(lat) || isNaN(lon)) return []
    return [{ lat, lon, name: launch.pad?.name ?? launch.name }]
  })

  const issLat = issPos?.lat
  const issLon = issPos?.lon
  const issAlt = issPos?.alt.toFixed(1) ?? '—'
  const issVel = issPos ? Math.round(issPos.vel).toLocaleString() : '—'
  const neoCount = neoData?.element_count ?? '—'

  const issAltNum = issPos?.alt ?? 0
  const issVelNum = issPos ? Math.round(issPos.vel) : 0
  const neoCountNum = typeof neoData?.element_count === 'number' ? neoData.element_count : 0

  const issAltAnimated = useCountUp(issAltNum)
  const issVelAnimated = useCountUp(issVelNum)
  const neoCountAnimated = useCountUp(neoCountNum)

  return (
    <>
      <StarField />
      <HazardChevron />
      <BelterHeader />

      <main id="main-content" className={appStyles.main ?? ''}>
        {/* Section 1: Globe hero */}
        <section
          className={`${appStyles.globeSection ?? ''} ${appStyles.panelEnter ?? ''}`}
          style={{ animationDelay: '150ms' }}
        >
          <div className={appStyles.globeFrame ?? ''}>
            <div className={appStyles.globeCenter ?? ''}>
              {mapMode === 'globe' ? (
                <Globe
                  size={460}
                  issLat={issLat}
                  issLon={issLon}
                  trail={issTrail}
                  events={globeEvents}
                  launches={launchMarkers}
                  warm={true}
                  autoRotate={true}
                  radarSweep={true}
                />
              ) : (
                <Suspense fallback={null}>
                  <WorldMap />
                </Suspense>
              )}

              {/* Callouts */}
              {mapMode === 'globe' && issPos && (
                <>
                  <span
                    className={`${appStyles.globeCallout ?? ''} ${appStyles.globeCalloutSignal ?? ''}`}
                    style={{ top: 16, left: 20 }}
                    aria-hidden="true"
                  >
                    ISS-TRACK
                  </span>
                  <span
                    className={appStyles.globeCallout ?? ''}
                    style={{ bottom: 16, right: 20 }}
                    aria-hidden="true"
                  >
                    EONET
                  </span>
                </>
              )}
            </div>

            {/* ISS readout bar — toggle lives here so it's always visible */}
            <div className={appStyles.issReadoutBar ?? ''}>
              <span className={appStyles.issReadoutLabel ?? ''}>ISS-1 · UNITY</span>
              <div className={appStyles.issReadoutValues ?? ''}>
                <span>
                  LAT{' '}
                  <span className={appStyles.issVal ?? ''}>
                    {issPos ? issPos.lat.toFixed(2) : '—'}
                  </span>
                  °
                </span>
                <span>
                  LON{' '}
                  <span className={appStyles.issVal ?? ''}>
                    {issPos ? issPos.lon.toFixed(2) : '—'}
                  </span>
                  °
                </span>
                <span>
                  ALT <span className={appStyles.issVal ?? ''}>{issAlt}</span> km
                </span>
                <span className={appStyles.issReadoutDelta ?? ''}>+5Hz SGP4</span>
              </div>
              <div className={appStyles.mapToggle ?? ''} role="group" aria-label="Map view mode">
                <button
                  type="button"
                  className={`${appStyles.mapToggleBtn ?? ''} ${mapMode === 'globe' ? (appStyles.mapToggleBtnActive ?? '') : ''}`}
                  onClick={() => setMapMode('globe')}
                  aria-pressed={mapMode === 'globe'}
                >
                  Globe
                </button>
                <button
                  type="button"
                  className={`${appStyles.mapToggleBtn ?? ''} ${mapMode === 'map' ? (appStyles.mapToggleBtnActive ?? '') : ''}`}
                  onClick={() => setMapMode('map')}
                  aria-pressed={mapMode === 'map'}
                >
                  Map
                </button>
              </div>
            </div>
          </div>

          {/* Telemetry plate */}
          <div className={appStyles.telemetryPlate ?? ''}>
            {RIVET_POSITIONS.map((pos, i) => (
              <span
                key={i}
                className={appStyles.cornerRivet ?? ''}
                style={pos}
                aria-hidden="true"
              />
            ))}

            {/* Brass plate header */}
            <div className={appStyles.brassPlate ?? ''} aria-label="Telemetry readout">
              <span>STATION TELEMETRY</span>
              <span>SYS-04</span>
            </div>

            {/* Salvage plates — big number readouts */}
            <div className={appStyles.salvagePlates ?? ''}>
              <div className={appStyles.salvagePlate ?? ''}>
                <div>
                  <div className={appStyles.salvageLabel ?? ''}>Orbital Altitude</div>
                  <div className={appStyles.salvageSub ?? ''}>ISS / 51.6° incl</div>
                </div>
                <div>
                  <div
                    className={appStyles.salvageValue ?? ''}
                    style={{ color: 'var(--signal)' }}
                    aria-label={`${issAlt} kilometers`}
                  >
                    {issPos ? issAltAnimated.toFixed(1) : '—'}
                  </div>
                  <div className={appStyles.salvageChalk ?? ''}>km asl</div>
                </div>
              </div>

              <div className={appStyles.salvagePlate ?? ''}>
                <div>
                  <div className={appStyles.salvageLabel ?? ''}>Orbital Velocity</div>
                  <div className={appStyles.salvageSub ?? ''}>7.7 km/s ref</div>
                </div>
                <div>
                  <div
                    className={appStyles.salvageValue ?? ''}
                    style={{ color: 'var(--copper-glow)' }}
                    aria-label={`${issVel} kilometers per hour`}
                  >
                    {issPos ? issVelAnimated.toLocaleString() : '—'}
                  </div>
                  <div className={appStyles.salvageChalk ?? ''}>km/h</div>
                </div>
              </div>

              <div className={appStyles.salvagePlate ?? ''}>
                <div>
                  <div className={appStyles.salvageLabel ?? ''}>Near-Earth Objects</div>
                  <div className={appStyles.salvageSub ?? ''}>Next 7 days · NASA</div>
                </div>
                <div>
                  <div
                    className={appStyles.salvageValue ?? ''}
                    style={{ color: 'var(--amber)' }}
                    aria-label={`${neoCount} near-Earth objects`}
                  >
                    {neoData ? neoCountAnimated : '—'}
                  </div>
                  <div className={appStyles.salvageChalk ?? ''}>approaches</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Launches — full width */}
        <section
          className={`${appStyles.launchSection ?? ''} ${appStyles.panelEnter ?? ''}`}
          style={{ animationDelay: '300ms' }}
        >
          <ErrorBoundary label="Launches">
            <LaunchPanel />
          </ErrorBoundary>
        </section>

        {/* Section 3: Sentry + Space Weather */}
        <section
          className={`${appStyles.newsSection ?? ''} ${appStyles.panelEnter ?? ''}`}
          style={{ animationDelay: '450ms' }}
        >
          <ErrorBoundary label="Sentry">
            <SentryPanel />
          </ErrorBoundary>
          <ErrorBoundary label="Space Weather">
            <SpaceWeatherStrip />
          </ErrorBoundary>
        </section>

        {/* Section 4: Asteroid table + Fireballs */}
        <section
          className={`${appStyles.asteroidSection ?? ''} ${appStyles.panelEnter ?? ''}`}
          style={{ animationDelay: '600ms' }}
        >
          <ErrorBoundary label="Close Approaches">
            <AsteroidTable />
          </ErrorBoundary>
          <ErrorBoundary label="Fireballs">
            <FireballList />
          </ErrorBoundary>
        </section>

        {/* Section 5: Solar Wind */}
        <section
          className={`${appStyles.solarSection ?? ''} ${appStyles.panelEnter ?? ''}`}
          style={{ animationDelay: '750ms' }}
        >
          <ErrorBoundary label="Solar Wind">
            <SolarWindPanel />
          </ErrorBoundary>
        </section>

        <Footer />
      </main>

      <ErrorBoundary>
        <Ticker />
      </ErrorBoundary>
    </>
  )
}
