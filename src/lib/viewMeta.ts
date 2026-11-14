/**
 * The five views, their paths, titles and header subtitles (ADR 0036). One source for the
 * app (the router, `document.title`, the header) and for `scripts/view-shells.mjs`, which
 * Node runs directly: **no imports and erasable syntax only**, like horizons.ts. The long
 * descriptions the shells carry live in the script, so none of that text is in the bundle.
 */

export type ConsoleView = 'earth' | 'orrery' | 'sun' | 'sky' | 'orbit'

export const CONSOLE_VIEWS: ConsoleView[] = ['earth', 'orrery', 'sun', 'sky', 'orbit']

export const SITE_ORIGIN = 'https://observatory.geektechlive.com'

export interface ViewMeta {
  /** Always starts and ends with a slash; Earth, the home page, is `/`. */
  path: string
  /** The tab title. Earth's equals index.html's `<title>` (a test pins it). */
  title: string
  /** The header's line under "Observatory": what the view on screen is. */
  subtitle: string
}

export const VIEW_META: Record<ConsoleView, ViewMeta> = {
  earth: {
    path: '/',
    title: 'Observatory: live ISS tracker, 3D orrery and space weather',
    subtitle: 'Earth watch, live NASA and NOAA feeds',
  },
  orrery: {
    path: '/orrery/',
    title: 'Orrery: 3D solar system with live spacecraft · Observatory',
    subtitle: 'The solar system in 3D, with live spacecraft',
  },
  sun: {
    path: '/sun/',
    title: 'Sun: live space weather, flares and solar wind · Observatory',
    subtitle: 'The Sun today, live from NASA and NOAA',
  },
  sky: {
    path: '/sky/',
    title: "Sky: tonight's planets, comets and asteroids · Observatory",
    subtitle: "Tonight's sky: planets, comets and asteroids",
  },
  orbit: {
    path: '/orbit/',
    title: "Orbit: who's in space, the Deep Space Network and launches · Observatory",
    subtitle: "Who's in space, the Deep Space Network and launches",
  },
}
