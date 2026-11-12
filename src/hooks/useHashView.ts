import { useEffect, useRef } from 'react'

import {
  type ConsoleView,
  LAYER_KEYS,
  type LayerKey,
  layersFromHash,
  useUiStore,
  viewFromHash,
} from '@/store/ui'

interface HashState {
  view: ConsoleView | null
  /** null when the URL says nothing about layers, so saved prefs win. */
  layers: Record<LayerKey, boolean> | null
}

function parseHash(): HashState {
  const { hash } = window.location
  return { view: viewFromHash(hash), layers: layersFromHash(hash) }
}

/**
 * Puts the hash's view and layers in the store in one update, so persist saves once
 * (a write per layer was about 15). Nothing the hash doesn't change is written.
 */
function applyHash({ view, layers }: HashState): void {
  const viewChange = view && view !== useUiStore.getState().view ? { view } : null
  if (!viewChange && !layers) return
  useUiStore.setState({ ...viewChange, ...(layers ? { layers } : null) })
}

/** Views that draw the Earth globe or map, the only ones the layers apply to. */
const LAYER_VIEWS: ReadonlySet<ConsoleView> = new Set(['earth', 'orbit'])

/** The orrery's own deep-link params (#108; the orrery chunk reads and writes them). */
const ORRERY_PARAMS: ReadonlySet<string> = new Set(['t', 'focus', 'preset', 'detail'])

/**
 * The orrery's params from a hash that is already on the orrery, raw so their encoding
 * stays as written. Anything else (an Earth `layers=`, #109) is dropped.
 */
function orreryQuery(hash: string): string {
  const [viewPart = '', queryPart] = hash.replace(/^#\/?/, '').split('?')
  if (viewPart.toLowerCase() !== 'orrery' || queryPart === undefined) return ''
  const kept = queryPart.split('&').filter((p) => ORRERY_PARAMS.has(p.split('=')[0] ?? ''))
  return kept.length > 0 ? `?${kept.join('&')}` : ''
}

export function buildHash(
  view: ConsoleView,
  layers: Record<LayerKey, boolean>,
  currentHash = '',
): string {
  if (view === 'orrery') return `#orrery${orreryQuery(currentHash)}`
  if (!LAYER_VIEWS.has(view)) return `#${view}`
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

  // The store already starts on the hash's view and layers (#167, #176); this mount
  // effect re-applies them, which saves a link's layers as the visitor's preferences,
  // then canonicalizes the hash in place. Intentionally mount-only: rerunning on any
  // store change would re-apply a stale URL over live user input. Store access goes
  // through `getState()` so the empty deps list is honest and no eslint-disable is
  // needed.
  useEffect(() => {
    applyHash(parseHash())
    const state = useUiStore.getState()
    previousViewRef.current = state.view
    window.history.replaceState(null, '', buildHash(state.view, state.layers, window.location.hash))
  }, [])

  // Respond to back/forward and manual hash edits.
  useEffect(() => {
    const onHashChange = () => {
      applyHash(parseHash())
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
    const next = buildHash(currentView, currentLayers, window.location.hash)
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
