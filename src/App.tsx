import { type ComponentType, lazy, Suspense, useMemo, useState } from 'react'

import { EarthConsole } from '@/components/consoles/EarthConsole'
import { OrbitConsole } from '@/components/consoles/OrbitConsole'
import { SkyConsole } from '@/components/consoles/SkyConsole'
import { SunConsole } from '@/components/consoles/SunConsole'
import { Footer } from '@/components/footer/Footer'
import { Globe } from '@/components/globe/Globe'
import { LayerControl } from '@/components/globe/LayerControl'
import { OrbitalDial } from '@/components/nav/OrbitalDial'
import { SkyStage } from '@/components/stage/SkyStage'
import { SunStage } from '@/components/stage/SunStage'
import { StarField } from '@/components/starfield/StarField'
import { VitalsSpine } from '@/components/status/VitalsSpine'
import { BelterHeader } from '@/components/status-bar/BelterHeader'
import { Ticker } from '@/components/ticker/Ticker'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { HazardChevron } from '@/components/ui/HazardChevron'
import { useAurora } from '@/hooks/useAurora'
import { useCountUp } from '@/hooks/useCountUp'
import { useEvents } from '@/hooks/useEvents'
import { useFireball } from '@/hooks/useFireball'
import { useFires } from '@/hooks/useFires'
import { useGdacs } from '@/hooks/useGdacs'
import { useHashView } from '@/hooks/useHashView'
import { useIss } from '@/hooks/useIss'
import { useLaunches } from '@/hooks/useLaunches'
import { useNeo } from '@/hooks/useNeo'
import { useQuakes } from '@/hooks/useQuakes'
import { useSatellites } from '@/hooks/useSatellites'
import { isPointGeometry } from '@/schemas/eonet'
import { type ConsoleView, useUiStore } from '@/store/ui'

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

  // ORBIT reframes the globe as a tracking station — orbital layers always on.
  const tracking = view === 'orbit'

  const { position: issPos, trail: issTrail, intervalMs: issIntervalMs } = useIss()
  const { data: eventsData } = useEvents()
  const { data: launchData } = useLaunches()
  const { data: neoData } = useNeo()
  const { data: fireballData } = useFireball(layers.fireballs)
  const { data: quakeData } = useQuakes()
  const { data: gdacsData } = useGdacs(layers.disasters)
  const satellites = useSatellites(layers.satellites || tracking)
  const { data: firesData } = useFires(layers.fires)
  const { data: auroraData } = useAurora(layers.aurora)

  // These feed Globe, which re-renders at the ISS tick rate. Without useMemo every
  // tick hands Globe five brand-new array identities and re-projects every marker.
  const globeEvents = useMemo(
    () =>
      (eventsData?.events ?? []).flatMap((ev) => {
        const geom = ev.geometry.find(isPointGeometry)
        if (!geom) return []
        const kind = ev.categories[0]?.id ?? 'other'
        return [{ lat: geom.coordinates[1] ?? 0, lon: geom.coordinates[0] ?? 0, kind }]
      }),
    [eventsData],
  )

  const launchMarkers = useMemo(
    () =>
      (launchData?.result ?? []).flatMap((launch) => {
        const lat = parseFloat(launch.pad?.latitude ?? '')
        const lon = parseFloat(launch.pad?.longitude ?? '')
        if (isNaN(lat) || isNaN(lon)) return []
        return [{ lat, lon, name: launch.pad?.name ?? launch.name }]
      }),
    [launchData],
  )

  const fireballMarkers = useMemo(
    () =>
      (fireballData?.data ?? []).flatMap((fb) => {
        if (fb.lat === null || fb.lon === null) return []
        const lat = parseFloat(fb.lat) * (fb.latDir === 'S' ? -1 : 1)
        const lon = parseFloat(fb.lon) * (fb.lonDir === 'W' ? -1 : 1)
        if (isNaN(lat) || isNaN(lon)) return []
        return [{ lat, lon, energy: fb.energy !== null ? parseFloat(fb.energy) || 0 : 0 }]
      }),
    [fireballData],
  )

  const quakeMarkers = useMemo(
    () =>
      (quakeData?.quakes ?? []).map((q) => ({
        lat: q.lat,
        lon: q.lon,
        mag: q.mag,
        place: q.place,
      })),
    [quakeData],
  )

  const disasterMarkers = useMemo(
    () =>
      (gdacsData?.events ?? []).map((d) => ({
        lat: d.lat,
        lon: d.lon,
        type: d.type,
        alert: d.alert,
        name: d.name,
      })),
    [gdacsData],
  )

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
  const stageKind = view === 'sun' ? 'sun' : view === 'sky' ? 'sky' : 'globe'

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
              <div className={appStyles.stageMorph ?? ''} key={stageKind}>
                {stageKind === 'sun' ? (
                  <SunStage size={460} />
                ) : stageKind === 'sky' ? (
                  <SkyStage size={460} />
                ) : mapMode === 'globe' ? (
                  <Globe
                    size={460}
                    issLat={issLat}
                    issLon={issLon}
                    issAlt={issOn ? issPos?.alt : undefined}
                    trail={issOn ? issTrail : []}
                    events={layers.events && !tracking ? globeEvents : []}
                    launches={layers.launches || tracking ? launchMarkers : []}
                    fireballs={layers.fireballs && !tracking ? fireballMarkers : []}
                    quakes={layers.quakes && !tracking ? quakeMarkers : []}
                    disasters={layers.disasters && !tracking ? disasterMarkers : []}
                    satellites={layers.satellites || tracking ? satellites : []}
                    fires={layers.fires && !tracking ? (firesData?.fires ?? []) : []}
                    aurora={layers.aurora ? (auroraData?.points ?? []) : []}
                    showTerminator={layers.terminator}
                    warm={!tracking}
                    tracking={tracking}
                    autoRotate={true}
                    radarSweep={true}
                  />
                ) : (
                  <Suspense fallback={null}>
                    <WorldMap />
                  </Suspense>
                )}
              </div>

              {stageKind === 'globe' && (
                <div className={appStyles.layerOverlay ?? ''}>
                  <LayerControl showMapLayers={mapMode === 'map'} />
                </div>
              )}
            </div>

            {/* ISS readout bar — globe/map toggle lives here so it's always visible */}
            {stageKind === 'globe' && (
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
                  <span className={appStyles.issReadoutDelta ?? ''}>
                    {issIntervalMs <= 200 ? '+5Hz SGP4' : 'SGP4 (reduced motion)'}
                  </span>
                </div>
                <div className={appStyles.mapToggle ?? ''} role="group" aria-label="Map view mode">
                  <button
                    type="button"
                    className={`${appStyles.mapToggleBtn ?? ''} ${mapMode === 'globe' ? (appStyles.mapToggleBtnActive ?? '') : ''}`}
                    onClick={() => {
                      setMapMode('globe')
                    }}
                    aria-pressed={mapMode === 'globe'}
                  >
                    Globe
                  </button>
                  <button
                    type="button"
                    className={`${appStyles.mapToggleBtn ?? ''} ${mapMode === 'map' ? (appStyles.mapToggleBtnActive ?? '') : ''}`}
                    onClick={() => {
                      setMapMode('map')
                    }}
                    aria-pressed={mapMode === 'map'}
                  >
                    Map
                  </button>
                </div>
              </div>
            )}
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
          {/* OrbitalDial renders role="tab" buttons with id console-tab-<view>;
              this is the panel those tabs control. */}
          <div id="console-panel" role="tabpanel" aria-labelledby={`console-tab-${view}`}>
            <ActiveConsole />
          </div>
        </ErrorBoundary>

        <Footer />
      </main>

      <ErrorBoundary>
        <Ticker />
      </ErrorBoundary>
    </>
  )
}
