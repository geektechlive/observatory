import { useEffect, useRef } from 'react'

import { locationUrl, readLocation, subscribeLocation } from '@/lib/viewRoute'
import { type ConsoleView, LAYER_KEYS, type LayerKey, layersFromHash, useUiStore } from '@/store/ui'

interface RouteState {
  view: ConsoleView | null
  /** null when the URL says nothing about layers, so saved prefs win. */
  layers: Record<LayerKey, boolean> | null
}

function parseRoute(): RouteState {
  const { view } = readLocation()
  return { view, layers: layersFromHash(window.location.hash) }
}

/**
 * Puts the address's view and layers in the store in one update, so persist saves once
 * (a write per layer was about 15). Nothing the address doesn't change is written.
 */
function applyRoute({ view, layers }: RouteState): void {
  const viewChange = view && view !== useUiStore.getState().view ? { view } : null
  if (!viewChange && !layers) return
  useUiStore.setState({ ...viewChange, ...(layers ? { layers } : null) })
}

/** Views that draw the Earth globe or map, the only ones the layers apply to. */
const LAYER_VIEWS: ReadonlySet<ConsoleView> = new Set(['earth', 'orbit'])

/** The deep-link params a console owns (#108 orrery, #99 sky; its chunk reads and writes them). */
const OWN_PARAMS: Partial<Record<ConsoleView, ReadonlySet<string>>> = {
  orrery: new Set(['t', 'focus', 'preset', 'detail']),
  sky: new Set(['target', 't']),
}

/**
 * A console's own params from an address that is already on it, raw so their encoding
 * stays as written. Anything else (an Earth `layers=`, #109) is dropped. The view is
 * judged by the path: a hash carries no view name any more.
 */
function ownParams(
  view: ConsoleView,
  current: { view: ConsoleView | null; params: string },
): string {
  const own = OWN_PARAMS[view]
  if (!own || current.view !== view) return ''
  return current.params
    .split('&')
    .filter((p) => own.has(p.split('=')[0] ?? ''))
    .join('&')
}

/** The path and hash that show a view with these layers; `current` is the address now. */
export function buildUrl(
  view: ConsoleView,
  layers: Record<LayerKey, boolean>,
  current: { view: ConsoleView | null; params: string } = { view: null, params: '' },
): string {
  if (view === 'orrery' || view === 'sky') return locationUrl(view, ownParams(view, current))
  if (!LAYER_VIEWS.has(view)) return locationUrl(view, '')
  const enabled = LAYER_KEYS.filter((k) => layers[k])
  return locationUrl(view, enabled.length > 0 ? `layers=${enabled.join(',')}` : '')
}

/** Keeps the query string (`?utm_…`) of the address when the path and hash are rewritten. */
const withSearch = (url: string): string => url.replace(/^([^#]*)/, `$1${window.location.search}`)

/**
 * Syncs the active console and its enabled layers with the URL hash so a
 * configured view is shareable and bookmarkable (`/#layers=iss,quakes`, `/orrery/`; ADR 0036).
 * Switching consoles pushes history (back returns to the previous console);
 * toggling layers replaces it, so a dozen checkbox clicks do not bury the back
 * button.
 */
export function useHashView(): void {
  const view = useUiStore((s) => s.view)
  const layers = useUiStore((s) => s.layers)
  const previousViewRef = useRef<ConsoleView | null>(null)

  // The store already starts on the address's view and layers (#167, #176); this mount
  // effect re-applies them, which saves a link's layers as the visitor's preferences,
  // then canonicalizes the address in place. Intentionally mount-only: rerunning on any
  // store change would re-apply a stale URL over live user input. Store access goes
  // through `getState()` so the empty deps list is honest and no eslint-disable is
  // needed.
  useEffect(() => {
    applyRoute(parseRoute())
    const state = useUiStore.getState()
    previousViewRef.current = state.view
    window.history.replaceState(
      window.history.state,
      '',
      withSearch(buildUrl(state.view, state.layers, readLocation())),
    )
  }, [])

  // Respond to back/forward, `navigate` and manual hash edits. Back from /orrery/ to / is
  // a path change, which raises `popstate` and no reliable `hashchange`.
  useEffect(
    () =>
      subscribeLocation(() => {
        applyRoute(parseRoute())
      }),
    [],
  )

  // Reflect store changes back into the address. State is read live rather than
  // from the render closure: on first mount this effect runs in the same commit
  // as the initializer above, where the closure still holds pre-address defaults
  // and would push a bogus entry over the URL the user actually opened.
  // `view`/`layers` are the change trigger only. This is the only place a view switch
  // pushes history, so a dial click, an arrow key and a link each add one entry.
  useEffect(() => {
    const { view: currentView, layers: currentLayers } = useUiStore.getState()
    const next = buildUrl(currentView, currentLayers, readLocation())
    const { pathname, hash } = window.location
    if (pathname + hash === next) {
      previousViewRef.current = currentView
      return
    }
    const consoleChanged =
      previousViewRef.current !== null && previousViewRef.current !== currentView
    previousViewRef.current = currentView
    const url = withSearch(next)
    if (consoleChanged) window.history.pushState(null, '', url)
    else window.history.replaceState(window.history.state, '', url)
  }, [view, layers])
}
