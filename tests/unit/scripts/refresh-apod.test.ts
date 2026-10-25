/**
 * APOD from science.nasa.gov (#72). apod.nasa.gov now 301s there, and NASA's APOD API
 * still scrapes the old page: on 2026-10-25 it answered the title "NASA Science" with
 * the NASA logo as the picture. The refresh job reads the new pages instead. Fixtures
 * are trimmed copies of the real pages from that day.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ApodSchema } from '@/schemas/apod'

import {
  apodArticleUrl,
  parseApodArticle,
  // @ts-expect-error plain ESM script, no type declarations
} from '../../../scripts/refresh-data.mjs'

const fixture = (name: string) => readFileSync(resolve(__dirname, 'fixtures', name), 'utf8')
const ARTICLE_URL =
  'https://science.nasa.gov/image-article/apod-2026-october-25-dark-matter-in-a-simulated-universe/'

describe('apodArticleUrl', () => {
  it('picks the newest day, not the first link: the explanation links to old days', () => {
    expect(apodArticleUrl(fixture('apod-index.html'))).toBe(ARTICLE_URL)
    const shuffled =
      '<a href="https://science.nasa.gov/image-article/apod-2014-may-12-old/">' +
      `<a href="${ARTICLE_URL}">` +
      '<a href="https://science.nasa.gov/image-article/apod-2026-october-3-earlier/">'
    expect(apodArticleUrl(shuffled)).toBe(ARTICLE_URL)
  })

  it('is null when the page has no APOD articles', () => {
    expect(apodArticleUrl('<html><a href="https://science.nasa.gov/">home</a></html>')).toBeNull()
  })
})

describe('parseApodArticle', () => {
  const apod = parseApodArticle(fixture('apod-article.html'), ARTICLE_URL)

  it('reads the date, title, plain-text explanation and picture', () => {
    expect(apod).toMatchObject({
      date: '2026-10-25',
      title: 'Dark Matter in a Simulated Universe',
      media_type: 'image',
      url: expect.stringMatching(
        /^https:\/\/assets\.science\.nasa\.gov\/.*DarkMatter_KipacAmnh_1200\.jpg/,
      ),
    })
    expect(apod.explanation).toMatch(
      /^Is our universe haunted\? It might look that way on this dark matter map\./,
    )
    expect(apod.explanation).not.toMatch(/<|Explanation:|&#|&amp;/)
  })

  it('passes the same schema as NASA API answers, so the handler serves either', () => {
    expect(ApodSchema.safeParse(apod).success).toBe(true)
  })

  it('throws on a page without the picture or title, never stores a placeholder', () => {
    expect(() =>
      parseApodArticle('<html><title>NASA Science</title></html>', ARTICLE_URL),
    ).toThrow()
    const noImage = fixture('apod-article.html').replace(/og:image/g, 'og:nothing')
    expect(() => parseApodArticle(noImage, ARTICLE_URL)).toThrow(/image/)
  })

  it('throws when the URL carries no date', () => {
    expect(() =>
      parseApodArticle(fixture('apod-article.html'), 'https://science.nasa.gov/image-article/x/'),
    ).toThrow(/date/)
  })
})
