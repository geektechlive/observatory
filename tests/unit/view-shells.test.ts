import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// @ts-expect-error plain ESM script, no type declarations
import * as shells from '../../scripts/view-shells.mjs'
import { CONSOLE_VIEWS, type ConsoleView, SITE_ORIGIN, VIEW_META } from '../../src/lib/viewMeta'

const renderShell = (shells as { renderShell: (html: string, view: ConsoleView) => string })
  .renderShell
const shellViews = (shells as { shellViews: ConsoleView[] }).shellViews

// The static shells (ADR 0036, #232): each view's URL answers HTML that already says what the
// view is. `pnpm verify` runs unit tests before the build, so they render from the source
// index.html with the same function the build script calls.

const ROOT = join(import.meta.dirname, '..', '..')
const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8')
const shell = (view: ConsoleView): string => renderShell(indexHtml, view)

function meta(html: string, attr: 'property' | 'name', key: string): string | undefined {
  return new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`).exec(html)?.[1]
}
const title = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1]
const canonical = (html: string) => /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1]
function jsonLd(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1] ?? '') as Record<string, unknown>,
  )
}
const noscript = (html: string) => /<noscript>[\s\S]*?<\/noscript>/.exec(html)?.[0] ?? ''

describe('the view list', () => {
  it('has a shell for every view but Earth, whose page is index.html', () => {
    expect([...shellViews].sort()).toEqual(CONSOLE_VIEWS.filter((v) => v !== 'earth').sort())
  })

  it('gives every view its own path and title', () => {
    const paths = CONSOLE_VIEWS.map((v) => VIEW_META[v].path)
    expect(new Set(paths).size).toBe(5)
    expect(paths).toEqual(['/', '/orrery/', '/sun/', '/sky/', '/orbit/'])
    expect(new Set(CONSOLE_VIEWS.map((v) => VIEW_META[v].title)).size).toBe(5)
    expect(new Set(CONSOLE_VIEWS.map((v) => VIEW_META[v].subtitle)).size).toBe(5)
  })

  it('takes no imports, so Node runs it as it is (like horizons.ts)', () => {
    const source = readFileSync(join(ROOT, 'src', 'lib', 'viewMeta.ts'), 'utf8')
    expect(source).not.toMatch(/^\s*import\s/m)
  })
})

describe.each(shellViews)('the %s shell', (view) => {
  const html = shell(view)
  const url = `${SITE_ORIGIN}${VIEW_META[view].path}`

  it('has its own title, in step with document.title', () => {
    expect(title(html)).toBe(VIEW_META[view].title)
    expect(title(html)).not.toBe(title(indexHtml))
  })

  it('has its own description, not the home page’s', () => {
    const description = meta(html, 'name', 'description') ?? ''
    expect(description.length).toBeGreaterThan(60)
    expect(description.length).toBeLessThanOrEqual(200)
    expect(description).not.toBe(meta(indexHtml, 'name', 'description'))
  })

  it('points the canonical, og:url at its own trailing-slash URL', () => {
    expect(canonical(html)).toBe(url)
    expect(meta(html, 'property', 'og:url')).toBe(url)
  })

  it('keeps og and twitter in step', () => {
    expect(meta(html, 'property', 'og:title')).toBe(title(html))
    expect(meta(html, 'name', 'twitter:title')).toBe(meta(html, 'property', 'og:title'))
    expect(meta(html, 'name', 'twitter:description')).toBe(meta(html, 'property', 'og:description'))
    expect(meta(html, 'property', 'og:description')).toBe(meta(html, 'name', 'description'))
  })

  it('carries one WebApplication block that parses and matches the page', () => {
    const blocks = jsonLd(html)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      url,
      isAccessibleForFree: true,
      operatingSystem: 'Web',
      description: meta(html, 'name', 'description'),
    })
    expect(blocks[0]?.['name']).toBeTruthy()
    expect(blocks[0]?.['applicationCategory']).toBeTruthy()
  })

  it('says what the view shows, with plain links to all five views', () => {
    const text = noscript(html)
    expect(text).toContain('Sources:')
    for (const v of CONSOLE_VIEWS) expect(text).toContain(`<a href="${VIEW_META[v].path}">`)
  })

  it('keeps the app: same module script, no second copy of the home page’s tags', () => {
    expect(html).toContain('<script type="module" src="/src/main.tsx"></script>')
    expect(html.match(/rel="canonical"/g)).toHaveLength(1)
    expect(html).not.toContain('id="ld-website"')
  })

  it('keeps its share image and alt text in step across og and twitter', () => {
    expect(meta(html, 'name', 'twitter:image')).toBe(meta(html, 'property', 'og:image'))
    expect(meta(html, 'name', 'twitter:image:alt')).toBe(meta(html, 'property', 'og:image:alt'))
  })
})

describe('the orrery shell’s share card (#255)', () => {
  const html = shell('orrery')

  it('previews as the orrery, not the Earth globe', () => {
    expect(meta(html, 'property', 'og:image')).toBe(`${SITE_ORIGIN}/og-orrery.png`)
    expect(meta(html, 'property', 'og:image:alt')).toMatch(/orrery/i)
    expect(meta(html, 'property', 'og:image:alt')).not.toMatch(/globe/i)
  })

  it('is a real 1200x630 PNG under 300 KB', () => {
    const png = readFileSync(join(ROOT, 'public', 'og-orrery.png'))
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
    expect(png.length).toBeLessThan(300 * 1024)
  })

  it('leaves the other shells on the home card', () => {
    for (const view of shellViews.filter((v) => v !== 'orrery')) {
      expect(meta(shell(view), 'property', 'og:image')).toBe(
        meta(indexHtml, 'property', 'og:image'),
      )
    }
  })
})

describe('the home page (index.html)', () => {
  it('has og:url with the trailing slash, as the canonical', () => {
    expect(meta(indexHtml, 'property', 'og:url')).toBe(`${SITE_ORIGIN}/`)
    expect(canonical(indexHtml)).toBe(`${SITE_ORIGIN}/`)
  })

  it('has a title equal to Earth’s document.title', () => {
    expect(title(indexHtml)).toBe(VIEW_META.earth.title)
  })

  it('carries WebSite and WebApplication JSON-LD that parse', () => {
    const types = jsonLd(indexHtml).map((b) => b['@type'])
    expect(types.sort()).toEqual(['WebApplication', 'WebSite'])
    for (const block of jsonLd(indexHtml)) expect(block['url']).toBe(`${SITE_ORIGIN}/`)
  })

  it('links the five views for a visitor without JavaScript', () => {
    const text = noscript(indexHtml)
    for (const v of CONSOLE_VIEWS) expect(text).toContain(`<a href="${VIEW_META[v].path}">`)
  })

  it('needs no CSP change for the JSON-LD: script-src has no inline allowance to open', () => {
    // A `type="application/ld+json"` script is a data block: the HTML spec's "prepare the
    // script element" returns for it before the CSP inline check, so nothing runs and
    // nothing is blocked. The policy stays as it is.
    const headers = readFileSync(join(ROOT, 'public', '_headers'), 'utf8')
    expect(/script-src[^;]*unsafe-inline/.test(headers)).toBe(false)
  })
})

describe('renderShell refuses to ship a stale shell', () => {
  it('throws when index.html loses a tag it rewrites', () => {
    const broken = indexHtml.replace(/<link rel="canonical"[^>]*>/, '')
    expect(() => renderShell(broken, 'orrery')).toThrow(/canonical/)
  })

  it('throws for Earth, which has no shell', () => {
    expect(() => renderShell(indexHtml, 'earth')).toThrow()
  })

  it('escapes "<" in the JSON-LD so no value can close the script', () => {
    expect(shell('orrery')).not.toMatch(/ld\+json[^>]*>[^<]*<(?!\/script>)/)
  })
})

describe('the build', () => {
  it('writes the shells after vite build', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    const steps = (pkg.scripts['build'] ?? '').split('&&').map((s) => s.trim())
    expect(steps.indexOf('node scripts/view-shells.mjs')).toBeGreaterThan(
      steps.indexOf('vite build'),
    )
    expect(steps).toContain('vite build')
  })

  it('leaves the Functions route as it is (no Function serves a view)', () => {
    const routes = JSON.parse(readFileSync(join(ROOT, 'public', '_routes.json'), 'utf8')) as {
      include: string[]
    }
    expect(routes.include).toEqual(['/api/*'])
  })
})

describe('the first load stays the same in every shell (ADR 0017)', () => {
  const loadTags = (shells as { loadTags: (html: string) => string[] }).loadTags
  // What `vite build` adds to dist/index.html: the entry script, preloads and stylesheet.
  const built = indexHtml.replace(
    '</head>',
    '<script type="module" crossorigin src="/assets/index-abc.js"></script>\n' +
      '<link rel="modulepreload" crossorigin href="/assets/vendor-def.js">\n' +
      '<link rel="stylesheet" crossorigin href="/assets/index-ghi.css">\n</head>',
  )

  it('finds the built load tags', () => {
    expect(loadTags(built).length).toBeGreaterThanOrEqual(5)
  })

  it.each(shellViews)('%s keeps every script, preload and stylesheet tag of index.html', (view) => {
    expect(loadTags(renderShell(built, view))).toEqual(loadTags(built))
  })
})
