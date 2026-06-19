import { useUiStore, type LayerKey } from '@/store/ui'
import styles from './layer-control.module.css'

interface LayerDef {
  key: LayerKey
  label: string
  dot: string
}

const GLOBE_LAYERS: LayerDef[] = [
  { key: 'iss', label: 'ISS', dot: 'var(--signal)' },
  { key: 'events', label: 'Events', dot: 'oklch(0.72 0.22 32)' },
  { key: 'quakes', label: 'Quakes', dot: 'oklch(0.8 0.18 55)' },
  { key: 'terminator', label: 'Day/Night', dot: 'oklch(0.75 0.08 250)' },
  { key: 'aurora', label: 'Aurora', dot: 'oklch(0.8 0.2 145)' },
  { key: 'fires', label: 'Fires', dot: 'oklch(0.85 0.2 55)' },
  { key: 'disasters', label: 'Alerts', dot: 'oklch(0.62 0.22 25)' },
  { key: 'satellites', label: 'Satellites', dot: 'var(--terminal)' },
  { key: 'fireballs', label: 'Fireballs', dot: 'oklch(0.88 0.18 60)' },
  { key: 'launches', label: 'Launch pads', dot: 'oklch(0.84 0.16 80)' },
]

const MAP_LAYERS: LayerDef[] = [
  { key: 'gibs', label: 'Imagery', dot: 'oklch(0.7 0.1 150)' },
  { key: 'air', label: 'Air PM2.5', dot: 'oklch(0.85 0.16 95)' },
  { key: 'nws', label: 'US Alerts', dot: '#ff3b30' },
  { key: 'aircraft', label: 'Aircraft', dot: '#4ade80' },
  { key: 'buoys', label: 'Ocean Buoys', dot: '#38d4ff' },
]

function Toggle({ def }: { def: LayerDef }) {
  const on = useUiStore((s) => s.layers[def.key])
  const toggleLayer = useUiStore((s) => s.toggleLayer)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`${styles.row ?? ''} ${on ? (styles.rowOn ?? '') : ''}`}
      onClick={() => toggleLayer(def.key)}
    >
      <span className={styles.mark ?? ''} aria-hidden="true">
        {on ? '◉' : '○'}
      </span>
      <span className={styles.dot ?? ''} style={{ background: def.dot }} aria-hidden="true" />
      <span className={styles.label ?? ''}>{def.label}</span>
    </button>
  )
}

export function LayerControl({ showMapLayers = false }: { showMapLayers?: boolean }) {
  return (
    <div className={styles.control ?? ''} aria-label="Map layers">
      <div className={styles.heading ?? ''}>Layers</div>
      {GLOBE_LAYERS.map((d) => (
        <Toggle key={d.key} def={d} />
      ))}
      {showMapLayers && (
        <>
          <div className={styles.divider ?? ''} aria-hidden="true" />
          {MAP_LAYERS.map((d) => (
            <Toggle key={d.key} def={d} />
          ))}
        </>
      )}
    </div>
  )
}
