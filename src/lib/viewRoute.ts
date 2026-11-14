/**
 * The address, in one place (ADR 0036): the view is the path (`/`, `/orrery/`, `/sun/`,
 * `/sky/`, `/orbit/`) and a view's own state is the hash, without the view name
 * (`/orrery/#t=…&focus=…`, `/#layers=iss,quakes`). Every reader and writer of the address
 * goes through here.
 *
 * Old links (`/#orrery?focus=…`, `#/sun`, `#earth?layers=…`) are still read, and
 * rewritten in place with `replaceState` the first time the address is read and on every
 * later address change, so a hand-typed old hash works too. Params stay raw: a `+` in a
 * year (`t=+009000-…`) must not become a space. In the first load, so no imports beyond the
 * view list.
 */
import { CONSOLE_VIEWS, type ConsoleView, VIEW_META } from './viewMeta'

export { CONSOLE_VIEWS, type ConsoleView }

/** The address's view, and the raw params after the `#` (no leading `#`). */
export interface ParsedLocation {
  view: ConsoleView | null
  params: string
}

export const viewPath = (view: ConsoleView): string => VIEW_META[view].path

/** `/orrery/`, `/orrery` and `/orrery/index.html` name the orrery; `/` is Earth. */
export function viewFromPathname(pathname: string): ConsoleView | null {
  const bare = pathname
    .toLowerCase()
    .replace(/\/index\.html$/, '/')
    .replace(/^\/|\/$/g, '')
  if (bare === '') return 'earth'
  return CONSOLE_VIEWS.find((v) => v !== 'earth' && v === bare) ?? null
}

/** `#orrery`, `#/orrery`, `#orrery?t=…`: the form before ADR 0036. */
const LEGACY = /^#\/?([a-z]+)(?:\?(.*))?$/i

function legacyParts(hash: string): { view: ConsoleView; params: string } | null {
  const match = LEGACY.exec(hash)
  const name = match?.[1]?.toLowerCase()
  const view = CONSOLE_VIEWS.find((v) => v === name)
  return match && view ? { view, params: match[2] ?? '' } : null
}

/**
 * The raw params in a hash, in the new form (`#t=…`) or the old (`#orrery?t=…`). With
 * `view`, an old-form hash for another view has none of this view's params.
 */
export function paramsOf(hash: string, view?: ConsoleView): string {
  const legacy = legacyParts(hash)
  if (!legacy) return hash.replace(/^#/, '')
  return view === undefined || legacy.view === view ? legacy.params : ''
}

export function parseLocation(pathname: string, hash: string): ParsedLocation {
  const legacy = legacyParts(hash)
  if (legacy) return legacy
  return { view: viewFromPathname(pathname), params: hash.replace(/^#/, '') }
}

/** The path and hash of a view with params (no `#` in `params`). */
export const locationUrl = (view: ConsoleView, params: string): string =>
  `${viewPath(view)}${params === '' ? '' : `#${params}`}`

/** Where an old-form address belongs, as path + hash; null when it is not an old form. */
export function legacyTarget(_pathname: string, hash: string): string | null {
  const legacy = legacyParts(hash)
  return legacy ? locationUrl(legacy.view, legacy.params) : null
}

/** Rewrites an old-form address in place, keeping the query string and `history.state`. */
export function normalizeLocation(): void {
  const { pathname, search, hash } = window.location
  const target = legacyTarget(pathname, hash)
  if (target === null) return
  const at = target.indexOf('#')
  const path = at < 0 ? target : target.slice(0, at)
  window.history.replaceState(
    window.history.state,
    '',
    `${path}${search}${at < 0 ? '' : target.slice(at)}`,
  )
}

/** The address now, after any old form has been rewritten. */
export function readLocation(): ParsedLocation {
  normalizeLocation()
  return parseLocation(window.location.pathname, window.location.hash)
}

/** The current view; an unknown path reads as Earth, which is what the app shows there. */
export const currentView = (): ConsoleView => readLocation().view ?? 'earth'

/** Fired by `navigate`: `pushState` and `replaceState` raise no event of their own. */
const LOCATION_EVENT = 'observatory:location'

/**
 * Calls back when the address changes: back and forward (`popstate`), a typed hash
 * (`hashchange`) and `navigate`. An old-form address is rewritten first. Some changes raise
 * two of these, so a callback must be safe to run twice.
 */
export function subscribeLocation(onChange: () => void): () => void {
  const handler = () => {
    normalizeLocation()
    onChange()
  }
  const events = ['popstate', 'hashchange', LOCATION_EVENT]
  for (const name of events) window.addEventListener(name, handler)
  return () => {
    for (const name of events) window.removeEventListener(name, handler)
  }
}

/** Goes to a path + hash inside the app: a new history entry, or `replace` the current. */
export function navigate(url: string, opts?: { replace?: boolean; state?: unknown }): void {
  const state = opts?.state ?? null
  if (opts?.replace) window.history.replaceState(state, '', url)
  else window.history.pushState(state, '', url)
  window.dispatchEvent(new Event(LOCATION_EVENT))
}

/**
 * Writes a view's params (`#t=…`, or '' for none) on the current path, without a new
 * history entry and without an event. Writing nothing must still clear the old hash.
 */
export function replaceHash(hash: string): void {
  const { pathname, search } = window.location
  window.history.replaceState(window.history.state, '', `${pathname}${search}${hash}`)
}

interface ClickLike {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/** A click the browser should handle as a link: new tab, new window, download, middle button. */
export const isModifiedClick = (e: ClickLike): boolean =>
  e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey
