import { useId, useState } from 'react'

import { LAYER_SWATCH, swatchColor } from '@/lib/palette'
import { type LayerKey, useUiStore } from '@/store/ui'

import styles from './layer-control.module.css'

interface LayerDef {
  key: LayerKey
  label: string
}

const GLOBE_LAYERS: LayerDef[] = [
  { key: 'iss', label: 'ISS' },
  { key: 'events', label: 'Events' },
  { key: 'quakes', label: 'Quakes' },
  { key: 'terminator', label: 'Day/Night' },
  { key: 'aurora', label: 'Aurora' },
  { key: 'fires', label: 'Fires' },
  { key: 'disasters', label: 'Alerts' },
  { key: 'satellites', label: 'Satellites' },
  { key: 'fireballs', label: 'Fireballs' },
  { key: 'launches', label: 'Launch pads' },
]

const MAP_LAYERS: LayerDef[] = [
  { key: 'gibs', label: 'Imagery' },
  { key: 'air', label: 'Air PM2.5' },
  { key: 'nws', label: 'US Alerts' },
  { key: 'aircraft', label: 'Aircraft' },
  { key: 'buoys', label: 'Ocean Buoys' },
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
      onClick={() => {
        toggleLayer(def.key)
      }}
    >
      <span className={styles.mark ?? ''} aria-hidden="true">
        {on ? '◉' : '○'}
      </span>
      <span
        className={styles.dot ?? ''}
        style={{ background: swatchColor(LAYER_SWATCH[def.key]) }}
        aria-hidden="true"
      />
      <span className={styles.label ?? ''}>{def.label}</span>
    </button>
  )
}

export function LayerControl({ showMapLayers = false }: { showMapLayers?: boolean }) {
  const [open, setOpen] = useState(false)
  const listId = useId()

  return (
    <div className={styles.control ?? ''} role="group" aria-label="Map layers">
      <button
        type="button"
        className={styles.chip ?? ''}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen((o) => !o)
        }}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span> Layers
      </button>
      <div className={styles.list ?? ''} id={listId} data-open={open}>
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
    </div>
  )
}
