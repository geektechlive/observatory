import { lazy, Suspense, useState, type ComponentType } from 'react'
import { useCountUp } from '@/hooks/useCountUp'
import { BelterHeader } from '@/components/status-bar/BelterHeader'
import { HazardChevron } from '@/components/ui/HazardChevron'
import { StarField } from '@/components/starfield/StarField'
import { Globe } from '@/components/globe/Globe'
import { LayerControl } from '@/components/globe/LayerControl'
import { VitalsSpine } from '@/components/status/VitalsSpine'
import { OrbitalDial } from '@/components/nav/OrbitalDial'
import { EarthConsole } from '@/components/consoles/EarthConsole'
import { SunConsole } from '@/components/consoles/SunConsole'
import { SkyConsole } from '@/components/consoles/SkyConsole'
import { OrbitConsole } from '@/components/consoles/OrbitConsole'
import { Ticker } from '@/components/ticker/Ticker'
import { Footer } from '@/components/footer/Footer'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { useHashView } from '@/hooks/useHashView'
import { useUiStore, type ConsoleView } from '@/store/ui'
import { useIss } from '@/hooks/useIss'
import { useEvents } from '@/hooks/useEvents'
import { useLaunches } from '@/hooks/useLaunches'
import { useNeo } from '@/hooks/useNeo'
import { useFireball } from '@/hooks/useFireball'
import { useQuakes } from '@/hooks/useQuakes'
import { useGdacs } from '@/hooks/useGdacs'
import { useSatellites } from '@/hooks/useSatellites'
import { useFires } from '@/hooks/useFires'
import { isPointGeometry } from '@/schemas/eonet'
import appStyles from './App.module.css'

const WorldMap = lazy(() =>
  import('@/components/world-map/WorldMap').then((m) => ({ default: m.WorldMap })),
)

type MapMode = 'globe' | 'map'

const CONSOLES: Record<ConsoleView, ComponentType> = {
  earth: EarthConsole,
  sun: SunConsole,
  sky: SkyConsole,
  orbit: OrbitConsole,
}

const RIVET_POSITIONS: { top?: number; bottom?: number; left?: number; right?: number }[] = [
  { top: 14, left: 14 },
  { top: 14, right: 14 },
  { bottom: 14, left: 14 },
  { bottom: 14, right: 14 },
]

export function App() {
  useHashView()
  const view = useUiStore((s) => s.view)
  const layers = useUiStore((s) => s.layers)
  const [mapMode, setMapMode] = useState<MapMode>('globe')

  const { position: issPos, trail: issTrail } = useIss()
  const { data: eventsData } = useEvents()
  const { data: launchData } = useLaunches()
  const { data: neoData } = useNeo()
  const { data: fireballData } = useFireball(layers.fireballs)
  const { data: quakeData } = useQuakes()
  const { data: gdacsData } = useGdacs(layers.disasters)
  const satellites = useSatellites(layers.satellites)
  const { data: firesData } = useFires(layers.fires)

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

  const fireballMarkers = (fireballData?.data ?? []).flatMap((fb) => {
    if (fb.lat === null || fb.lon === null) return []
    const lat = parseFloat(fb.lat) * (fb.latDir === 'S' ? -1 : 1)
    const lon = parseFloat(fb.lon) * (fb.lonDir === 'W' ? -1 : 1)
    if (isNaN(lat) || isNaN(lon)) return []
    return [{ lat, lon, energy: fb.energy !== null ? parseFloat(fb.energy) || 0 : 0 }]
  })

  const quakeMarkers = (quakeData?.quakes ?? []).map((q) => ({
    lat: q.lat,
    lon: q.lon,
    mag: q.mag,
    place: q.place,
  }))

  const disasterMarkers = (gdacsData?.events ?? []).map((d) => ({
    lat: d.lat,
    lon: d.lon,
    type: d.type,
    alert: d.alert,
    name: d.name,
  }))

  // Globe layer gating: pass data only when the layer is enabled.
  const issOn = layers.iss
  const issLat = issOn ? issPos?.lat : undefined
  const issLon = issOn ? issPos?.lon : undefined
  const issAlt = issPos?.alt.toFixed(1) ?? '—'
  const issVel = issPos ? Math.round(issPos.vel).toLocaleString() : '—'
  const neoCount = neoData?.element_count ?? '—'

  const issAltNum = issPos?.alt ?? 0
  const issVelNum = issPos ? Math.round(issPos.vel) : 0
  const neoCountNum = typeof neoData?.element_count === 'number' ? neoData.element_count : 0

  const issAltAnimated = useCountUp(issAltNum)
  const issVelAnimated = useCountUp(issVelNum)
  const neoCountAnimated = useCountUp(neoCountNum)

  const ActiveConsole = CONSOLES[view]

  return (
    <>
      <StarField />
      <HazardChevron />
      <BelterHeader />
      <VitalsSpine />

      <main id="main-content" className={appStyles.main ?? ''}>
        {/* Stage — the persistent transforming instrument */}
        <section
          className={`${appStyles.globeSection ?? ''} ${appStyles.panelEnter ?? ''}`}
          style={{ animationDelay: '120ms' }}
        >
          <div className={appStyles.globeFrame ?? ''}>
            <div className={appStyles.globeCenter ?? ''}>
              {mapMode === 'globe' ? (
                <Globe
                  size={460}
                  issLat={issLat}
                  issLon={issLon}
                  issAlt={issOn ? issPos?.alt : undefined}
                  trail={issOn ? issTrail : []}
                  events={layers.events ? globeEvents : []}
                  launches={layers.launches ? launchMarkers : []}
                  fireballs={layers.fireballs ? fireballMarkers : []}
                  quakes={layers.quakes ? quakeMarkers : []}
                  disasters={layers.disasters ? disasterMarkers : []}
                  satellites={layers.satellites ? satellites : []}
                  fires={layers.fires ? (firesData?.fires ?? []) : []}
                  showTerminator={layers.terminator}
                  warm={true}
                  autoRotate={true}
                  radarSweep={true}
                />
              ) : (
                <Suspense fallback={null}>
                  <WorldMap />
                </Suspense>
              )}

              <div className={appStyles.layerOverlay ?? ''}>
                <LayerControl showMapLayers={mapMode === 'map'} />
              </div>
            </div>

            {/* ISS readout bar — globe/map toggle lives here so it's always visible */}
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

            <div className={appStyles.brassPlate ?? ''} aria-label="Telemetry readout">
              <span>STATION TELEMETRY</span>
              <span>SYS-04</span>
            </div>

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

        {/* Console selector + active console */}
        <OrbitalDial />
        <ErrorBoundary label="Console">
          <ActiveConsole />
        </ErrorBoundary>

        <Footer />
      </main>

      <ErrorBoundary>
        <Ticker />
      </ErrorBoundary>
    </>
  )
}
