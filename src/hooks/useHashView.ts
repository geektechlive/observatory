import { useEffect, useRef } from 'react'

import {
  CONSOLE_VIEWS,
  type ConsoleView,
  isLayerKey,
  LAYER_KEYS,
  type LayerKey,
  useUiStore,
} from '@/store/ui'

interface HashState {
  view: ConsoleView | null
  /** null when the URL says nothing about layers, so saved prefs win. */
  layers: LayerKey[] | null
}

function parseHash(): HashState {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [viewPart = '', queryPart] = raw.split('?')
  const candidate = viewPart.toLowerCase()
  const view = (CONSOLE_VIEWS as string[]).includes(candidate) ? (candidate as ConsoleView) : null

  if (queryPart === undefined) return { view, layers: null }

  const layersParam = new URLSearchParams(queryPart).get('layers')
  if (layersParam === null) return { view, layers: null }

  const layers = layersParam
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter(isLayerKey)

  return { view, layers }
}

function buildHash(view: ConsoleView, layers: Record<LayerKey, boolean>): string {
  const enabled = LAYER_KEYS.filter((k) => layers[k])
  return enabled.length > 0 ? `#${view}?layers=${enabled.join(',')}` : `#${view}`
}

/**
 * Syncs the active console and its enabled layers with the URL hash so a
 * configured view is shareable and bookmarkable (`#earth?layers=iss,quakes`).
 * Switching consoles pushes history (back returns to the previous console);
 * toggling layers replaces it, so a dozen checkbox clicks do not bury the back
 * button.
 */
export function useHashView(): void {
  const view = useUiStore((s) => s.view)
  const layers = useUiStore((s) => s.layers)
  const previousViewRef = useRef<ConsoleView | null>(null)

  // Initialize from the hash on first mount, then canonicalize it in place.
  // Intentionally mount-only: rerunning on any store change would re-apply a
  // stale URL over live user input. Store access goes through `getState()` so
  // the empty deps list is honest and no eslint-disable is needed.
  useEffect(() => {
    const { setView, setLayer } = useUiStore.getState()
    const parsed = parseHash()
    if (parsed.view) setView(parsed.view)
    if (parsed.layers) {
      const enabled = new Set<LayerKey>(parsed.layers)
      LAYER_KEYS.forEach((key) => {
        setLayer(key, enabled.has(key))
      })
    }
    const state = useUiStore.getState()
    previousViewRef.current = state.view
    window.history.replaceState(null, '', buildHash(state.view, state.layers))
  }, [])

  // Respond to back/forward and manual hash edits.
  useEffect(() => {
    const onHashChange = () => {
      const { setView, setLayer } = useUiStore.getState()
      const parsed = parseHash()
      if (parsed.view) setView(parsed.view)
      if (parsed.layers) {
        const enabled = new Set<LayerKey>(parsed.layers)
        LAYER_KEYS.forEach((key) => {
          setLayer(key, enabled.has(key))
        })
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => {
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [])

  // Reflect store changes back into the hash. State is read live rather than
  // from the render closure: on first mount this effect runs in the same commit
  // as the initializer above, where the closure still holds pre-hash defaults
  // and would push a bogus entry over the URL the user actually opened.
  // `view`/`layers` are the change trigger only.
  useEffect(() => {
    const { view: currentView, layers: currentLayers } = useUiStore.getState()
    const next = buildHash(currentView, currentLayers)
    if (window.location.hash === next) {
      previousViewRef.current = currentView
      return
    }
    const consoleChanged =
      previousViewRef.current !== null && previousViewRef.current !== currentView
    previousViewRef.current = currentView
    if (consoleChanged) window.history.pushState(null, '', next)
    else window.history.replaceState(null, '', next)
  }, [view, layers])
}
