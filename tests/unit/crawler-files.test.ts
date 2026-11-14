import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CONSOLE_VIEWS, SITE_ORIGIN, VIEW_META } from '../../src/lib/viewMeta'

// #233 (404 page) and #234 (robots.txt, sitemap.xml, llms.txt), ADR 0036.

const PUBLIC = join(import.meta.dirname, '..', '..', 'public')
const read = (name: string) => readFileSync(join(PUBLIC, name), 'utf8')
const urls = CONSOLE_VIEWS.map((v) => `${SITE_ORIGIN}${VIEW_META[v].path}`)

describe('public/robots.txt', () => {
  const robots = read('robots.txt')

  it('allows every crawler and blocks no path', () => {
    expect(robots).toMatch(/^User-agent: \*$/m)
    expect(robots).toMatch(/^Allow: \/$/m)
    expect(robots).not.toMatch(/^Disallow: *\S/m)
  })

  it('names no crawler to turn away, AI crawlers included', () => {
    const agents = [...robots.matchAll(/^User-agent: (.*)$/gm)].map((m) => m[1])
    expect(agents).toEqual(['*'])
    expect(robots).not.toMatch(/Content-Signal/i)
  })

  it('points at the sitemap', () => {
    expect(robots).toMatch(new RegExp(`^Sitemap: ${SITE_ORIGIN}/sitemap\\.xml$`, 'm'))
  })
})

describe('public/sitemap.xml', () => {
  it('lists the five views, exactly', () => {
    const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1])
    expect(locs).toEqual(urls)
  })

  it('is XML in the sitemap namespace', () => {
    expect(read('sitemap.xml')).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')
  })
})

describe('public/llms.txt', () => {
  const llms = read('llms.txt')

  it('is short, and names the five views by URL', () => {
    expect(llms.split('\n').length).toBeLessThanOrEqual(20)
    for (const url of urls) expect(llms).toContain(`(${url})`)
  })

  it('names the sources the README credits', () => {
    for (const name of ['NASA', 'NOAA', 'Space-Track.org']) {
      expect(llms).toContain(name)
    }
    expect(llms).toContain('Horizons')
  })
})

describe('public/404.html (#233)', () => {
  const page = read('404.html')

  it('is a real page: a title, and links to the five views', () => {
    expect(page).toMatch(/<title>[^<]+<\/title>/)
    for (const v of CONSOLE_VIEWS) expect(page).toContain(`<a href="${VIEW_META[v].path}">`)
  })

  it('stands alone: no app bundle, no script, and the page is kept out of the index', () => {
    expect(page).not.toMatch(/<script/i)
    expect(page).not.toContain('/assets/')
    expect(page).toContain('<meta name="robots" content="noindex" />')
  })
})
