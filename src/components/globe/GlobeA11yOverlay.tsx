import { useEffect, useRef, useState } from 'react'

import { Overlay } from '@/components/ui/Overlay'
import { eventLabel, quakeLabel } from '@/lib/globeLayers'

import styles from './globe-a11y-overlay.module.css'
import type { ProjectedItem } from './three/GlobeRenderer'

interface OverlayRenderer {
  setOnFrame(callback: ((items: readonly ProjectedItem[]) => void) | null): void
}

interface GlobeA11yOverlayProps {
  renderer: OverlayRenderer
  /** The canvas design size in px; positions convert to percentages of it. */
  size: number
  events: readonly { lat: number; lon: number; kind: string }[]
  quakes: readonly { lat: number; lon: number; mag: number | null; place: string }[]
  /** True while an item has focus, so the host pauses rotation and the target holds still. */
  onFocusChange: (focused: boolean) => void
}

const keyOf = (layer: string, index: number) => `${layer}:${String(index)}`
/** Tooltip sits up and to the right of the marker, clear of the focus ring. */
const TOOLTIP_OFFSET = { x: 14, y: -30 }

/**
 * Focusable list items over the WebGL globe (#48). A canvas has no DOM for assistive
 * tech; these are real elements, positioned every frame from the renderer's own
 * projection through refs (never React state per frame). Items behind the limb are
 * hidden and leave the tab order, except the one holding focus.
 */
export function GlobeA11yOverlay({
  renderer,
  size,
  events,
  quakes,
  onFocusChange,
}: GlobeA11yOverlayProps) {
  const nodes = useRef(new Map<string, HTMLDivElement>())
  const positions = useRef(new Map<string, { x: number; y: number }>())
  const focusedKey = useRef<string | null>(null)
  const [tooltip, setTooltip] = useState<{ label: string; x: number; y: number } | null>(null)

  useEffect(() => {
    renderer.setOnFrame((items) => {
      for (const item of items) {
        const key = keyOf(item.layer, item.index)
        positions.current.set(key, { x: item.x, y: item.y })
        const node = nodes.current.get(key)
        if (!node) continue
        // Percentages of the lens, so items stay on their markers when CSS scales the globe.
        node.style.left = `${String((item.x / size) * 100)}%`
        node.style.top = `${String((item.y / size) * 100)}%`
        node.hidden = !item.visible && focusedKey.current !== key
      }
    })
    return () => {
      renderer.setOnFrame(null)
    }
  }, [renderer, size])

  const focusHandlers = (key: string, label: string) => ({
    onFocus: () => {
      focusedKey.current = key
      const at = positions.current.get(key) ?? { x: 0, y: 0 }
      setTooltip({ label, x: at.x + TOOLTIP_OFFSET.x, y: at.y + TOOLTIP_OFFSET.y })
      onFocusChange(true)
    },
    onBlur: () => {
      focusedKey.current = null
      setTooltip(null)
      onFocusChange(false)
    },
  })

  const item = (layer: 'events' | 'quakes', index: number, label: string) => {
    const key = keyOf(layer, index)
    return (
      <div
        key={key}
        ref={(node) => {
          if (node) nodes.current.set(key, node)
          else nodes.current.delete(key)
        }}
        role="listitem"
        // Focusable readouts, not controls: there is no activation, so not a button. Same
        // pattern as the SVG globe's EventMarkers; focus is how keyboard users reach them.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        aria-label={label}
        className={styles.item ?? ''}
        {...focusHandlers(key, label)}
      />
    )
  }

  return (
    <>
      <div role="list" aria-label="Earth events and earthquakes" className={styles.list ?? ''}>
        {events.map((e, i) => item('events', i, eventLabel(e)))}
        {quakes.map((q, i) => item('quakes', i, quakeLabel(q)))}
      </div>
      {tooltip && (
        <Overlay kind="tooltip" x={tooltip.x} y={tooltip.y}>
          {tooltip.label}
        </Overlay>
      )}
    </>
  )
}
