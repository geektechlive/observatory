import { useMemo } from 'react'

import { useAurora } from '@/hooks/useAurora'
import { useEvents } from '@/hooks/useEvents'
import { useFireball } from '@/hooks/useFireball'
import { useFires } from '@/hooks/useFires'
import { useGdacs } from '@/hooks/useGdacs'
import { useIss } from '@/hooks/useIss'
import { useLaunches } from '@/hooks/useLaunches'
import { useQuakes } from '@/hooks/useQuakes'
import { useSatellites } from '@/hooks/useSatellites'
import { eventsByLane, laneCensus, layerStatus } from '@/lib/census'
import { isPointGeometry } from '@/schemas/eonet'
import { useUiStore } from '@/store/ui'

/**
 * One empty list for every globe layer that's off or still loading. App re-renders
 * at 5 Hz with the ISS, and a fresh `[]` each time made the globe rebuild (#60).
 */
const NO_ITEMS: readonly never[] = []

/**
 * Everything the globe draws, gated by the layer switches, plus the bezel's lane
 * census (#51). Moved out of App (#63) so App is only the layout.
 */
export function useGlobeData() {
  const view = useUiStore((s) => s.view)
  const layers = useUiStore((s) => s.layers)
  // ORBIT reframes the globe as a tracking station: orbital layers always on.
  const tracking = view === 'orbit'

  const { position: issPos, trail: issTrail, intervalMs: issIntervalMs } = useIss()
  const eventsQuery = useEvents()
  const launchQuery = useLaunches()
  const fireballQuery = useFireball(layers.fireballs)
  const quakeQuery = useQuakes()
  const { data: gdacsData } = useGdacs(layers.disasters)
  const satellites = useSatellites(layers.satellites || tracking)
  const firesQuery = useFires(layers.fires)
  const { data: auroraData } = useAurora(layers.aurora)

  const eventsData = eventsQuery.data
  const launchData = launchQuery.data
  const fireballData = fireballQuery.data
  const quakeData = quakeQuery.data
  const firesData = firesQuery.data

  // These feed the globe, which re-renders at the ISS tick rate. Without useMemo every
  // tick hands it brand-new array identities and re-projects every marker.
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

  // The bezel's live census (#51): what each lane draws, and whether its feeds are
  // healthy, so a zero from a failed feed never reads as a quiet Earth.
  const eventsOn = layers.events && !tracking
  const census = useMemo(
    () =>
      laneCensus({
        // An empty satellite list always means "not loaded yet"; there is no true zero.
        satellites: {
          enabled: layers.satellites || tracking,
          loading: satellites.length === 0,
          error: false,
          hasData: satellites.length > 0,
          count: satellites.length,
        },
        launches: layerStatus(launchQuery, layers.launches || tracking, launchMarkers.length),
        fires: layerStatus(firesQuery, layers.fires && !tracking, firesData?.fires.length ?? 0),
        fireballs: layerStatus(
          fireballQuery,
          layers.fireballs && !tracking,
          fireballMarkers.length,
        ),
        quakes: layerStatus(quakeQuery, layers.quakes && !tracking, quakeMarkers.length),
        events: {
          ...layerStatus(eventsQuery, eventsOn, globeEvents.length),
          byLane: eventsByLane(globeEvents),
        },
      }),
    [
      layers,
      tracking,
      eventsOn,
      satellites,
      launchQuery,
      launchMarkers,
      firesQuery,
      firesData,
      fireballQuery,
      fireballMarkers,
      quakeQuery,
      quakeMarkers,
      eventsQuery,
      globeEvents,
    ],
  )

  const issOn = layers.iss
  const globeProps = {
    issLat: issOn ? issPos?.lat : undefined,
    issLon: issOn ? issPos?.lon : undefined,
    issAlt: issOn ? issPos?.alt : undefined,
    trail: issOn ? issTrail : NO_ITEMS,
    events: eventsOn ? globeEvents : NO_ITEMS,
    launches: layers.launches || tracking ? launchMarkers : NO_ITEMS,
    fireballs: layers.fireballs && !tracking ? fireballMarkers : NO_ITEMS,
    quakes: layers.quakes && !tracking ? quakeMarkers : NO_ITEMS,
    disasters: layers.disasters && !tracking ? disasterMarkers : NO_ITEMS,
    satellites: layers.satellites || tracking ? satellites : NO_ITEMS,
    fires: layers.fires && !tracking ? (firesData?.fires ?? NO_ITEMS) : NO_ITEMS,
    aurora: layers.aurora ? (auroraData?.points ?? NO_ITEMS) : NO_ITEMS,
    showTerminator: layers.terminator,
    warm: !tracking,
    tracking,
  }

  return { globeProps, census, issPos, issIntervalMs }
}
