import { Globe } from '@/components/globe/Globe'
import type { ThreeMarker } from '@/components/globe/GlobeThree'
import { GlobeThree } from '@/components/globe/GlobeThree'

/** SPIKE — throwaway side-by-side harness, mounted only at ?spike=globe. */

const MARKERS: ThreeMarker[] = [
  { lat: 34.05, lon: -118.24, label: 'Wildfire, California', color: '#e84020' },
  { lat: 35.68, lon: 139.69, label: 'Quake, Japan', color: '#e8a020' },
  { lat: -33.87, lon: 151.21, label: 'Storm, Sydney', color: '#40a0e8' },
  { lat: 51.5, lon: -0.13, label: 'Event, London', color: '#e84020' },
  { lat: -1.29, lon: 36.82, label: 'Fire, Nairobi', color: '#e8a020' },
]

const EVENTS = MARKERS.map((m) => ({ lat: m.lat, lon: m.lon, kind: 'wildfires' }))

export function GlobeCompare() {
  return (
    <main style={{ padding: 32, color: '#e8ded0', background: '#0b0a09', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18, letterSpacing: '0.08em' }}>GLOBE SPIKE — SVG vs three.js</h1>
      <div style={{ display: 'flex', gap: 64, flexWrap: 'wrap', marginTop: 32 }}>
        <section>
          <h2 style={{ fontSize: 13, opacity: 0.7 }}>Incumbent — SVG (Globe.tsx)</h2>
          <Globe size={460} events={EVENTS} warm autoRotate />
        </section>
        <section>
          <h2 style={{ fontSize: 13, opacity: 0.7 }}>Spike — three.js, ungraded</h2>
          <GlobeThree size={460} markers={MARKERS} autoRotate />
        </section>
        <section>
          <h2 style={{ fontSize: 13, opacity: 0.7 }}>Spike — three.js, copper-graded</h2>
          {/* Same grade the map already applies to its basemap in
              world-map.module.css, so the comparison is fair to the locked
              Glass / Luxury Futurist direction rather than against it. */}
          <div style={{ filter: 'sepia(0.62) brightness(0.78) saturate(1.35) hue-rotate(-8deg)' }}>
            <GlobeThree size={460} markers={MARKERS} autoRotate />
          </div>
        </section>
      </div>
    </main>
  )
}
