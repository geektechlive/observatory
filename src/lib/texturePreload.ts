import { globeTextures } from '@/lib/globe3d'
import { type ConsoleView, viewFromHash } from '@/store/ui'

/**
 * Screens that start the Earth textures at boot (#85): on a 4G phone the early 310 kB
 * delayed the app's first paint by ~160 ms, so narrower screens wait for GlobeHost.
 */
export const EARLY_TEXTURES_MEDIA = '(min-width: 900px)'

/** The views whose lens is the globe (#172, #173); the orrery, Sun and Sky draw none. */
export function isGlobeView(view: ConsoleView): boolean {
  return view === 'earth' || view === 'orbit'
}

/**
 * At boot, before React renders (#173): start the 2048 pair every globe tier draws first,
 * on desktop-size screens, for the views that draw the globe. This replaced static links in
 * index.html, which can't see the hash: a desktop #orrery, #sun or #sky downloaded 310 kB
 * of Earth for nothing. Measured locally (20 Mbps, 40 ms RTT, median of 5): #orrery's 3D
 * view 604 -> 538 ms; Earth's textured globe 609 -> 617 ms, as the entry now runs first.
 */
export function preloadTexturesAtBoot(hash: string): void {
  if (!isGlobeView(viewFromHash(hash) ?? 'earth')) return
  if (!window.matchMedia(EARLY_TEXTURES_MEDIA).matches) return
  preloadTextures(globeTextures({ textureWidth: 2048 }).first)
}

/**
 * Start the Earth textures alongside the renderer chunk (#87). The boot preload covers
 * screens 900px and wider only (#85), so on a phone they used to wait for the chunk
 * to arrive, ~430 ms on 4G. GlobeHost calls this when it starts the import, which is
 * after first paint, so the early download no longer competes with it.
 *
 * The attributes must match the boot links and three's TextureLoader (CORS mode
 * 'anonymous'), or the browser downloads each file twice.
 */
export function preloadTextures(textures: { day: string; night: string }): void {
  for (const href of [textures.day, textures.night]) {
    if (alreadyPreloaded(href)) continue
    const link = document.createElement('link')
    link.setAttribute('rel', 'preload')
    link.setAttribute('as', 'image')
    link.setAttribute('type', 'image/webp')
    link.setAttribute('crossorigin', 'anonymous')
    link.setAttribute('href', href)
    document.head.append(link)
  }
}

function alreadyPreloaded(href: string): boolean {
  return [...document.querySelectorAll<HTMLLinkElement>('link[rel="preload"]')].some(
    (link) =>
      link.getAttribute('href') === href && (!link.media || window.matchMedia(link.media).matches),
  )
}
