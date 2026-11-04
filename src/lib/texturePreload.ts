/**
 * Start the Earth textures alongside the renderer chunk (#87). index.html preloads them
 * on screens 900px and wider only (#85), so on a phone they used to wait for the chunk
 * to arrive, ~430 ms on 4G. GlobeHost calls this when it starts the import, which is
 * after first paint, so the early download no longer competes with it.
 *
 * The attributes must match the static links and three's TextureLoader (CORS mode
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
