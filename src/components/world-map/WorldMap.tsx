import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEvents } from '@/hooks/useEvents'
import { useIss } from '@/hooks/useIss'
import { useQuakes } from '@/hooks/useQuakes'
import { useGdacs } from '@/hooks/useGdacs'
import { useFires } from '@/hooks/useFires'
import { useAirQuality } from '@/hooks/useAirQuality'
import { useNwsAlerts } from '@/hooks/useNwsAlerts'
import { useAircraft } from '@/hooks/useAircraft'
import { useBuoys } from '@/hooks/useBuoys'
import { isPointGeometry } from '@/schemas/eonet'
import type { EonetEvent } from '@/schemas/eonet'
import type { Quake } from '@/schemas/quakes'
import type { GdacsEvent } from '@/schemas/gdacs'
import type { Fire } from '@/schemas/fires'
import type { AirStation } from '@/schemas/airQuality'
import type { NwsFeature } from '@/schemas/nws'
import type { Aircraft } from '@/schemas/aircraft'
import type { Buoy } from '@/schemas/buoys'
import { useUiStore } from '@/store/ui'
import { MapLegend } from './MapLegend'
import styles from './world-map.module.css'

function categoryColor(categoryId: string): string {
  if (categoryId === 'wildfires') return '#e84020'
  if (categoryId === 'severeStorms') return '#38d4ff'
  if (categoryId === 'earthquakes') return '#ffe044'
  if (categoryId === 'volcanoes') return '#dd44ff'
  if (categoryId === 'floods') return '#2255dd'
  if (categoryId === 'landslides') return '#b08040'
  if (categoryId === 'seaLakeIce') return '#cceeee'
  return '#c89050'
}

function categoryLabel(categoryId: string): string {
  if (categoryId === 'wildfires') return 'Wildfire'
  if (categoryId === 'severeStorms') return 'Severe Storm'
  if (categoryId === 'earthquakes') return 'Earthquake'
  if (categoryId === 'volcanoes') return 'Volcano'
  if (categoryId === 'floods') return 'Flood'
  if (categoryId === 'landslides') return 'Landslide'
  if (categoryId === 'seaLakeIce') return 'Sea/Lake Ice'
  return 'Event'
}

interface EventFeatureProperties {
  color: string
  title: string
  id: string
  categoryId: string
  sourceUrl: string
  eventDate: string
}

function eventsToGeoJson(
  events: EonetEvent[],
): GeoJSON.FeatureCollection<GeoJSON.Point, EventFeatureProperties> {
  const features: GeoJSON.Feature<GeoJSON.Point, EventFeatureProperties>[] = []

  for (const event of events) {
    for (const geom of event.geometry) {
      if (!isPointGeometry(geom)) continue
      const categoryId = event.categories[0]?.id ?? ''
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: geom.coordinates },
        properties: {
          color: categoryColor(categoryId),
          title: event.title,
          id: event.id,
          categoryId,
          sourceUrl: event.sources[0]?.url ?? '',
          eventDate: geom.date,
        },
      })
    }
  }

  return { type: 'FeatureCollection', features }
}

function quakeMapColor(mag: number | null): string {
  if (mag === null) return '#8aa0a8'
  if (mag >= 6) return '#ff5a3c'
  if (mag >= 4.5) return '#ffb020'
  return '#ffe044'
}

function quakesToGeoJson(
  quakes: Quake[],
): GeoJSON.FeatureCollection<GeoJSON.Point, { color: string; radius: number; title: string }> {
  return {
    type: 'FeatureCollection',
    features: quakes.map((q) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [q.lon, q.lat] },
      properties: {
        color: quakeMapColor(q.mag),
        radius: Math.min(9, Math.max(2.5, 2 + (q.mag ?? 2.5) * 0.9)),
        title: `M${q.mag?.toFixed(1) ?? '?'} — ${q.place}`,
      },
    })),
  }
}

// NASA GIBS true-color tiles lag a few hours; use yesterday (UTC).
function gibsDate(): string {
  const d = new Date(Date.now() - 24 * 3600 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

function gdacsToGeoJson(
  events: GdacsEvent[],
): GeoJSON.FeatureCollection<GeoJSON.Point, { color: string; title: string }> {
  return {
    type: 'FeatureCollection',
    features: events.map((e) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
      properties: {
        color: e.alert === 'Red' ? '#ff5a3c' : '#ffb020',
        title: `${e.alert} · ${e.name}`,
      },
    })),
  }
}

function fireMapColor(frp: number): string {
  if (frp >= 100) return '#fff0c0'
  if (frp >= 30) return '#ff9020'
  return '#e8602a'
}

function firesToGeoJson(
  fires: Fire[],
): GeoJSON.FeatureCollection<GeoJSON.Point, { color: string }> {
  return {
    type: 'FeatureCollection',
    features: fires.map((f) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
      properties: { color: fireMapColor(f.frp) },
    })),
  }
}

// US-EPA PM2.5 (µg/m³) → AQI color band.
function aqiColor(pm25: number): string {
  if (pm25 <= 12) return '#4ade80'
  if (pm25 <= 35.4) return '#fde047'
  if (pm25 <= 55.4) return '#fb923c'
  if (pm25 <= 150.4) return '#ef4444'
  return '#a855f7'
}

function airToGeoJson(
  stations: AirStation[],
): GeoJSON.FeatureCollection<GeoJSON.Point, { color: string }> {
  return {
    type: 'FeatureCollection',
    features: stations.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: { color: aqiColor(s.pm25) },
    })),
  }
}

function nwsToGeoJson(features: NwsFeature[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: features.map((f) => ({
      type: 'Feature',
      geometry: f.geometry as GeoJSON.Geometry,
      properties: { color: f.color, event: f.event },
    })),
  }
}

function altColor(altM: number | null): string {
  if (altM === null) return '#8aa0a8'
  if (altM < 3000) return '#ffb020'
  if (altM < 9000) return '#4ade80'
  return '#38d4ff'
}
function aircraftToGeoJson(
  list: Aircraft[],
): GeoJSON.FeatureCollection<GeoJSON.Point, { color: string }> {
  return {
    type: 'FeatureCollection',
    features: list.map((a) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
      properties: { color: altColor(a.altM) },
    })),
  }
}

function sstColor(t: number | null): string {
  if (t === null) return '#6a8090'
  if (t <= 5) return '#4a6fff'
  if (t <= 15) return '#38d4ff'
  if (t <= 24) return '#4ade80'
  return '#ff9500'
}
function buoysToGeoJson(list: Buoy[]): GeoJSON.FeatureCollection<GeoJSON.Point, { color: string }> {
  return {
    type: 'FeatureCollection',
    features: list.map((b) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
      properties: { color: sstColor(b.waterTemp) },
    })),
  }
}

export function WorldMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const clickPopupRef = useRef<maplibregl.Popup | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  const layers = useUiStore((s) => s.layers)
  const { data: events } = useEvents()
  const { position, trail } = useIss()
  const { data: quakeData } = useQuakes()
  const { data: gdacsData } = useGdacs(layers.disasters)
  const { data: firesData } = useFires(layers.fires)
  const { data: airData } = useAirQuality(layers.air)
  const { data: nwsData } = useNwsAlerts(layers.nws)
  const { data: aircraftData } = useAircraft(layers.aircraft)
  const { data: buoysData } = useBuoys(layers.buoys)
  const eonetFailed = useUiStore((s) => s.sourceErrors['eonet'] === true)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json',
      center: [0, 20],
      zoom: 1.5,
      interactive: true,
    })

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    mapRef.current = map

    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(containerRef.current)

    map.on('load', () => {
      // NASA GIBS MODIS true-color imagery (bottom layer, hidden until toggled).
      map.addSource('gibs-truecolor', {
        type: 'raster',
        tiles: [
          `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${gibsDate()}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
        ],
        tileSize: 256,
        maxzoom: 9,
        attribution: 'Imagery © NASA GIBS / EOSDIS',
      })
      map.addLayer({
        id: 'gibs-layer',
        type: 'raster',
        source: 'gibs-truecolor',
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': 0.85 },
      })

      map.addSource('iss-trail', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [] },
          properties: {},
        },
      })
      map.addLayer({
        id: 'iss-trail-line',
        type: 'line',
        source: 'iss-trail',
        paint: {
          'line-color': '#7dd3fc',
          'line-width': 1.5,
          'line-opacity': 0.35,
          'line-dasharray': [3, 3],
        },
      })

      // NWS alert polygons (bottom of the marker stack, hidden until toggled).
      map.addSource('nws', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'nws-fill',
        type: 'fill',
        source: 'nws',
        layout: { visibility: 'none' },
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 },
      })
      map.addLayer({
        id: 'nws-outline',
        type: 'line',
        source: 'nws',
        layout: { visibility: 'none' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 1, 'line-opacity': 0.7 },
      })

      map.addSource('buoys', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'buoy-dots',
        type: 'circle',
        source: 'buoys',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': 3,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.8,
          'circle-stroke-width': 0.5,
          'circle-stroke-color': 'rgba(255,255,255,0.3)',
        },
      })

      map.addSource('aircraft', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'aircraft-dots',
        type: 'circle',
        source: 'aircraft',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': 2.4,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.85,
        },
      })

      map.addSource('air-quality', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'air-dots',
        type: 'circle',
        source: 'air-quality',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': 4,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.55,
          'circle-blur': 0.5,
        },
      })

      map.addSource('fires', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'fire-dots',
        type: 'circle',
        source: 'fires',
        paint: {
          'circle-radius': 2.5,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.85,
          'circle-blur': 0.3,
        },
      })

      map.addSource('quakes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'quake-rings',
        type: 'circle',
        source: 'quakes',
        paint: {
          'circle-radius': ['get', 'radius'],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-width': 1.1,
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-opacity': 0.85,
        },
      })

      map.addSource('eonet-events', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'eonet-halos',
        type: 'circle',
        source: 'eonet-events',
        paint: {
          'circle-radius': 12,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.15,
          'circle-blur': 0.6,
        },
      })
      map.addLayer({
        id: 'eonet-dots',
        type: 'circle',
        source: 'eonet-events',
        paint: {
          'circle-radius': 5,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.9,
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,255,255,0.25)',
        },
      })

      map.addSource('gdacs', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'gdacs-alerts',
        type: 'circle',
        source: 'gdacs',
        paint: {
          'circle-radius': 6,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.85,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': 'rgba(0,0,0,0.6)',
        },
      })

      map.addSource('iss-position', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'iss-halo',
        type: 'circle',
        source: 'iss-position',
        paint: {
          'circle-radius': 16,
          'circle-color': 'rgba(125,211,252,0.12)',
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(125,211,252,0.3)',
        },
      })
      map.addLayer({
        id: 'iss-dot',
        type: 'circle',
        source: 'iss-position',
        paint: {
          'circle-radius': 5,
          'circle-color': '#7dd3fc',
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.8)',
        },
      })
      map.addLayer({
        id: 'iss-label',
        type: 'symbol',
        source: 'iss-position',
        layout: {
          'text-field': 'ISS',
          'text-size': 10,
          'text-offset': [0, -1.6],
          'text-anchor': 'bottom',
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        },
        paint: {
          'text-color': '#7dd3fc',
          'text-halo-color': 'rgba(4,6,15,0.85)',
          'text-halo-width': 1.5,
        },
      })

      map.on(
        'click',
        'eonet-dots',
        (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
          const feature = e.features?.[0]
          if (!feature) return
          const geom = feature.geometry as GeoJSON.Point
          const coords = geom.coordinates as [number, number]
          const title = (feature.properties['title'] as string | undefined) ?? ''
          const catId = (feature.properties['categoryId'] as string | undefined) ?? ''
          const color = (feature.properties['color'] as string | undefined) ?? '#cbd5e1'
          const sourceUrl = (feature.properties['sourceUrl'] as string | undefined) ?? ''
          const eventDate = (feature.properties['eventDate'] as string | undefined) ?? ''

          if (popupRef.current) {
            popupRef.current.remove()
            popupRef.current = null
          }

          const inner = document.createElement('div')
          inner.className = 'eonet-popup-inner'

          const labelEl = document.createElement('div')
          labelEl.className = 'eonet-popup-label'
          labelEl.style.color = color
          labelEl.textContent = categoryLabel(catId)
          inner.appendChild(labelEl)

          const titleEl = document.createElement('div')
          titleEl.className = 'eonet-popup-title'
          titleEl.textContent = title
          inner.appendChild(titleEl)

          if (eventDate) {
            const dateEl = document.createElement('div')
            dateEl.className = 'eonet-popup-date'
            dateEl.textContent = new Date(eventDate).toLocaleDateString()
            inner.appendChild(dateEl)
          }

          if (sourceUrl) {
            const linkEl = document.createElement('a')
            linkEl.className = 'eonet-popup-link'
            linkEl.href = sourceUrl
            linkEl.target = '_blank'
            linkEl.rel = 'noopener noreferrer'
            linkEl.textContent = 'View source →'
            inner.appendChild(linkEl)
          }

          if (clickPopupRef.current) clickPopupRef.current.remove()

          clickPopupRef.current = new maplibregl.Popup({
            closeButton: true,
            closeOnClick: true,
            offset: 10,
            className: 'eonet-popup',
          })
            .setLngLat(coords)
            .setDOMContent(inner)
            .addTo(map)

          const clickPopupEl = clickPopupRef.current.getElement()
          const mapWrap = containerRef.current?.parentElement
          if (clickPopupEl && mapWrap) mapWrap.appendChild(clickPopupEl)
        },
      )

      // Hover popup
      map.on(
        'mouseenter',
        'eonet-dots',
        (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
          map.getCanvas().style.cursor = 'pointer'
          const feature = e.features?.[0]
          if (!feature) return
          const geom = feature.geometry as GeoJSON.Point
          const coords = geom.coordinates as [number, number]
          const title = (feature.properties['title'] as string | undefined) ?? ''
          const catId = (feature.properties['categoryId'] as string | undefined) ?? ''
          const color = (feature.properties['color'] as string | undefined) ?? '#cbd5e1'

          const inner = document.createElement('div')
          inner.className = 'eonet-popup-inner'

          const labelEl = document.createElement('div')
          labelEl.className = 'eonet-popup-label'
          labelEl.style.color = color
          labelEl.textContent = categoryLabel(catId)
          inner.appendChild(labelEl)

          const titleEl = document.createElement('div')
          titleEl.className = 'eonet-popup-title'
          titleEl.textContent = title
          inner.appendChild(titleEl)

          if (popupRef.current) popupRef.current.remove()

          popupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 10,
            className: 'eonet-popup',
          })
            .setLngLat(coords)
            .setDOMContent(inner)
            .addTo(map)

          // Move popup element to mapWrap so it isn't clipped by the container's overflow:hidden
          const popupEl = popupRef.current.getElement()
          const mapWrap = containerRef.current?.parentElement
          if (popupEl && mapWrap) mapWrap.appendChild(popupEl)
        },
      )

      map.on('mouseleave', 'eonet-dots', () => {
        map.getCanvas().style.cursor = ''
        if (popupRef.current) {
          popupRef.current.remove()
          popupRef.current = null
        }
      })

      setMapLoaded(true)
    })

    return () => {
      resizeObserver.disconnect()
      popupRef.current?.remove()
      clickPopupRef.current?.remove()
      map.remove()
      mapRef.current = null
      setMapLoaded(false)
    }
  }, [])

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const src = mapRef.current.getSource('eonet-events') as GeoJSONSource | undefined
    if (!src) return
    const data = eventsToGeoJson(events?.events ?? [])
    src.setData(data)
  }, [mapLoaded, events])

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const src = mapRef.current.getSource('quakes') as GeoJSONSource | undefined
    if (!src) return
    src.setData(quakesToGeoJson(quakeData?.quakes ?? []))
  }, [mapLoaded, quakeData])

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const src = mapRef.current.getSource('gdacs') as GeoJSONSource | undefined
    if (!src) return
    src.setData(gdacsToGeoJson(gdacsData?.events ?? []))
  }, [mapLoaded, gdacsData])

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const src = mapRef.current.getSource('fires') as GeoJSONSource | undefined
    if (!src) return
    src.setData(firesToGeoJson(firesData?.fires ?? []))
  }, [mapLoaded, firesData])

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const src = mapRef.current.getSource('air-quality') as GeoJSONSource | undefined
    if (src) src.setData(airToGeoJson(airData?.stations ?? []))
  }, [mapLoaded, airData])

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const src = mapRef.current.getSource('nws') as GeoJSONSource | undefined
    if (src) src.setData(nwsToGeoJson(nwsData?.features ?? []))
  }, [mapLoaded, nwsData])

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const src = mapRef.current.getSource('aircraft') as GeoJSONSource | undefined
    if (src) src.setData(aircraftToGeoJson(aircraftData?.aircraft ?? []))
  }, [mapLoaded, aircraftData])

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const src = mapRef.current.getSource('buoys') as GeoJSONSource | undefined
    if (src) src.setData(buoysToGeoJson(buoysData?.buoys ?? []))
  }, [mapLoaded, buoysData])

  // Layer visibility driven by the shared LayerControl (store).
  useEffect(() => {
    const map = mapRef.current
    if (!mapLoaded || !map) return
    const vis: [string, boolean][] = [
      ['gibs-layer', layers.gibs],
      ['air-dots', layers.air],
      ['nws-fill', layers.nws],
      ['nws-outline', layers.nws],
      ['aircraft-dots', layers.aircraft],
      ['buoy-dots', layers.buoys],
      ['eonet-halos', layers.events],
      ['eonet-dots', layers.events],
      ['quake-rings', layers.quakes],
      ['fire-dots', layers.fires],
      ['gdacs-alerts', layers.disasters],
      ['iss-trail-line', layers.iss],
      ['iss-halo', layers.iss],
      ['iss-dot', layers.iss],
      ['iss-label', layers.iss],
    ]
    for (const [id, on] of vis) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
    }
  }, [mapLoaded, layers])

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const src = mapRef.current.getSource('iss-trail') as GeoJSONSource | undefined
    if (!src) return
    src.setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: trail },
      properties: {},
    })
  }, [mapLoaded, trail])

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const src = mapRef.current.getSource('iss-position') as GeoJSONSource | undefined
    if (!src) return
    src.setData({
      type: 'FeatureCollection',
      features: position
        ? [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [position.lon, position.lat] },
              properties: {},
            },
          ]
        : [],
    })
  }, [mapLoaded, position])

  const selectedEventId = useUiStore((s) => s.selectedEventId)
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !selectedEventId) return
    if (!selectedEventId.startsWith('eonet-')) return
    const rawId = selectedEventId.slice('eonet-'.length)
    const event = events?.events.find((e) => e.id === rawId)
    if (!event) return
    const geom = event.geometry.find(isPointGeometry)
    if (!geom) return
    mapRef.current.flyTo({ center: geom.coordinates as [number, number], zoom: 3, duration: 1000 })
  }, [mapLoaded, selectedEventId, events])

  return (
    <div className={styles.mapWrap ?? ''}>
      <div ref={containerRef} className={styles.container ?? ''} />
      <MapLegend events={events?.events ?? []} issVisible={position !== null} />
      {eonetFailed && (
        <div className={styles.eonetBadge ?? ''} role="status" aria-live="polite">
          EONET unavailable
        </div>
      )}
    </div>
  )
}
