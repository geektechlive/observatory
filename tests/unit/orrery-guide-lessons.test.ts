import { describe, expect, it } from 'vitest'

import { L1_KEY } from '@/components/orrery/catalog'
import {
  buildLessons,
  closestApproach,
  type LessonApproach,
} from '@/components/orrery/guide/lessons'
import { parseOrreryLink, serialiseOrreryLink } from '@/components/orrery/orreryLink'
import { PLANETS } from '@/lib/orrery'
import { CRAFT } from '@/lib/orrery/craft'
import { lookupSpkid } from '@/lib/orrery/lookupTrack'
import { INTERSTELLAR } from '@/lib/orrery/smallBodies'
import { smallBodyKey } from '@/lib/orrery/smallBodyView'

function approach(over: Partial<LessonApproach> & { id: string; distAu: number }): LessonApproach {
  const { id, distAu, ...rest } = over
  return {
    id,
    des: id.replace('sb:', ''),
    name: `(${id.replace('sb:', '')})`,
    pha: false,
    placed: true,
    closeApproach: { date: '2026-11-12T08:30:00.000Z', distAu },
    ...rest,
  }
}

describe('closestApproach (#159)', () => {
  it('picks the smallest miss distance among the placed objects', () => {
    const pick = closestApproach([
      approach({ id: 'sb:1', distAu: 0.03 }),
      approach({ id: 'sb:2', distAu: 0.002 }),
      approach({ id: 'sb:3', distAu: 0.01 }),
    ])
    expect(pick?.id).toBe('sb:2')
  })

  it('skips an object Horizons could not place: the link could not focus it', () => {
    const pick = closestApproach([
      approach({ id: 'sb:1', distAu: 0.0005, placed: false }),
      approach({ id: 'sb:2', distAu: 0.04 }),
    ])
    expect(pick?.id).toBe('sb:2')
  })

  it('returns null when there is nothing to show', () => {
    expect(closestApproach([])).toBeNull()
    expect(closestApproach([approach({ id: 'sb:9', distAu: 0.01, placed: false })])).toBeNull()
  })
})

describe('the lessons (#159)', () => {
  const lessons = buildLessons({
    approaches: [approach({ id: 'sb:2026 UE2', distAu: 0.0021, pha: true })],
  })

  it('has six to eight lessons, each with a short explanation and a source', () => {
    expect(lessons.length).toBeGreaterThanOrEqual(6)
    expect(lessons.length).toBeLessThanOrEqual(8)
    for (const l of lessons) {
      expect(l.paragraphs.length, l.id).toBeGreaterThanOrEqual(2)
      expect(l.paragraphs.length, l.id).toBeLessThanOrEqual(4)
      expect(l.sources.length, l.id).toBeGreaterThan(0)
      expect(l.tryIt.length, l.id).toBeGreaterThan(20)
    }
  })

  it('shows visitors only public sources, never file paths, tests or issue numbers', () => {
    const internal = /\.tsx?\b|CLAUDE\.md|tests\/|src\/|#\d+/
    for (const l of lessons) {
      for (const source of l.sources) expect(source, l.id).not.toMatch(internal)
      expect([l.title, ...l.paragraphs, l.tryIt].join(' '), l.id).not.toMatch(internal)
    }
  })

  it('has unique ids', () => {
    expect(new Set(lessons.map((l) => l.id)).size).toBe(lessons.length)
  })

  it('writes no em or en dashes', () => {
    for (const l of lessons) {
      const text = [l.title, ...l.paragraphs, l.tryIt].join(' ')
      expect(text, l.id).not.toMatch(/[–—]/)
    }
  })

  it('gives every lesson a link that survives a round trip through the address', () => {
    for (const l of lessons) {
      expect(l.link, l.id).not.toBeNull()
      const link = l.link
      if (!link) continue
      expect(parseOrreryLink(serialiseOrreryLink(link)), l.id).toEqual(link)
      expect(link.focus !== null || link.preset !== null, l.id).toBe(true)
    }
  })

  it('points each focus at something the orrery can show', () => {
    const planets = new Set<string>(PLANETS)
    const craft = new Set(CRAFT.map((c) => `naif:${c.naifId}`))
    const lookups = new Set(INTERSTELLAR.map((o) => o.spkid))
    const visitors = new Set(INTERSTELLAR.map((o) => smallBodyKey(o.spkid)))
    for (const l of lessons) {
      const focus = l.link?.focus
      if (!focus || focus.startsWith('sb:')) continue
      const ok =
        planets.has(focus) ||
        craft.has(focus) ||
        focus === L1_KEY ||
        visitors.has(focus) ||
        lookups.has(lookupSpkid(focus) ?? '')
      expect(ok, `${l.id}: ${focus}`).toBe(true)
    }
  })

  it("opens 'Oumuamua from the orrery's own data, so it is drawn once (#99)", () => {
    const link = lessons.find((l) => l.id === 'oumuamua')?.link
    expect(link?.focus).toBe('sbc:50788063')
  })

  it('keeps the dated lessons on their dates, and the live ones live', () => {
    const byId = Object.fromEntries(lessons.map((l) => [l.id, l.link]))
    expect(byId['voyager-1']?.t).toBe(Date.UTC(2012, 7, 25))
    expect(byId['mars-retrograde']?.t).toBe(Date.UTC(2025, 0, 16))
    expect(byId['oumuamua']?.t).toBe(Date.UTC(2017, 8, 9, 12, 0, 0))
    // Moons, L1, the Earth frame and satellites only exist within days of today.
    for (const id of ['l1', 'jupiter-moons', 'geostationary']) {
      expect(byId[id]?.t, id).toBeNull()
    }
  })

  it('builds the asteroid lesson from the closest pass, at the moment of the pass', () => {
    const l = lessons.find((x) => x.id === 'closest-asteroid')
    expect(l?.link?.focus).toBe('sb:2026 UE2')
    expect(l?.link?.preset).toBe('earth')
    expect(l?.link?.t).toBe(Date.parse('2026-11-12T08:30:00.000Z'))
    const text = l?.paragraphs.join(' ') ?? ''
    // 0.0021 au is 0.0021 * 149,597,870.7 / 384,400 = 0.82 lunar distances.
    expect(text).toContain('0.8 lunar distances')
    expect(text.toLowerCase()).toContain('potentially hazardous')
  })

  it('shows the asteroid lesson as waiting when there is no data yet', () => {
    const none = buildLessons({ approaches: [] }).find((x) => x.id === 'closest-asteroid')
    expect(none?.link).toBeNull()
    expect(none?.unavailable).toMatch(/close-approach data/i)
  })
})
