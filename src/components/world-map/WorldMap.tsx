import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEvents } from '@/hooks/useEvents'
import { useIss } from '@/hooks/useIss'
import { isPointGeometry } from '@/schemas/eonet'
import type { EonetEvent } from '@/schemas/eonet'
import { useUiStore } from '@/store/ui'
import { MapLegend } from './MapLegend'
import styles from './world-map.module.css'

function categoryColor(categoryId: string): string {
  if (categoryId === 'wildfires') return '#fb7185'
  if (categoryId === 'severeStorms') return '#fbbf24'
  if (categoryId === 'earthquakes') return '#f472b6'
  if (categoryId === 'volcanoes') return '#fb923c'
  if (categoryId === 'floods') return '#67e8f9'
  if (categoryId === 'landslides') return '#a78bfa'
  return '#cbd5e1'
}

interface EventFeatureProperties {
  color: string
  title: string
  id: string
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
        },
      })
    }
  }

  return { type: 'FeatureCollection', features }
}

export function WorldMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  const { data: events } = useEvents()
  const { position, trail } = useIss()

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json',
      center: [0, 20],
      zoom: 1.5,
      attributionControl: false,
      interactive: true,
    })

    mapRef.current = map

    map.on('load', () => {
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

      map.on(
        'click',
        'eonet-dots',
        (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
          const feature = e.features?.[0]
          if (!feature) return
          const id = feature.properties['id'] as string | undefined
          if (id != null) useUiStore.getState().setSelectedEventId(id)
        },
      )

      setMapLoaded(true)
    })

    return () => {
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

  return (
    <div ref={containerRef} className={styles.container ?? ''}>
      <MapLegend events={events?.events ?? []} issVisible={position !== null} />
    </div>
  )
}
