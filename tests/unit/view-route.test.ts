import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  isModifiedClick,
  legacyTarget,
  navigate,
  paramsOf,
  parseLocation,
  readLocation,
  subscribeLocation,
  viewFromPathname,
  viewPath,
} from '@/lib/viewRoute'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('viewFromPathname (ADR 0036)', () => {
  it.each([
    ['/', 'earth'],
    ['', 'earth'],
    ['/index.html', 'earth'],
    ['/orrery/', 'orrery'],
    ['/orrery', 'orrery'],
    ['/Sun/', 'sun'],
    ['/sky/index.html', 'sky'],
    ['/orbit/', 'orbit'],
  ])('%j is %s', (path, view) => {
    expect(viewFromPathname(path)).toBe(view)
  })

  it.each(['/nope/', '/orrery/x/', '/earth/'])('%j names no view', (path) => {
    expect(viewFromPathname(path)).toBeNull()
  })
})

describe('parseLocation', () => {
  it('reads the view from the path and the params from the hash', () => {
    expect(parseLocation('/orrery/', '#t=2012-08-25&focus=Mars')).toEqual({
      view: 'orrery',
      params: 't=2012-08-25&focus=Mars',
    })
    expect(parseLocation('/', '#layers=iss,quakes')).toEqual({
      view: 'earth',
      params: 'layers=iss,quakes',
    })
    expect(parseLocation('/sun/', '')).toEqual({ view: 'sun', params: '' })
  })

  it('keeps a "+" in a year as written', () => {
    expect(parseLocation('/orrery/', '#t=+009000-01-01').params).toBe('t=+009000-01-01')
  })

  it.each([
    ['#orrery?t=2012-08-25&focus=Mars', 'orrery', 't=2012-08-25&focus=Mars'],
    ['#/orrery?focus=Mars', 'orrery', 'focus=Mars'],
    ['#ORRERY', 'orrery', ''],
    ['#earth?layers=fires,quakes', 'earth', 'layers=fires,quakes'],
    ['#/sun', 'sun', ''],
    ['#sky?target=sbc:20000004', 'sky', 'target=sbc:20000004'],
  ])('reads the old form %j', (hash, view, params) => {
    expect(parseLocation('/', hash)).toEqual({ view, params })
  })

  it('does not take an anchor for a view', () => {
    expect(parseLocation('/orrery/', '#main-content')).toEqual({
      view: 'orrery',
      params: 'main-content',
    })
  })
})

describe('legacyTarget', () => {
  it.each([
    ['#orrery?t=2012-08-25&focus=Mars', '/orrery/#t=2012-08-25&focus=Mars'],
    ['#/orrery?focus=jupiter', '/orrery/#focus=jupiter'],
    ['#orrery', '/orrery/'],
    ['#earth?layers=iss', '/#layers=iss'],
    ['#orbit?layers=fires', '/orbit/#layers=fires'],
    [
      '#sky?target=sbc:1004035&t=2026-11-14T22:00:00Z',
      '/sky/#target=sbc:1004035&t=2026-11-14T22:00:00Z',
    ],
  ])('rewrites %j to %j', (hash, target) => {
    expect(legacyTarget('/', hash)).toBe(target)
  })

  it('is null for the new form and for no hash', () => {
    expect(legacyTarget('/orrery/', '#focus=Mars')).toBeNull()
    expect(legacyTarget('/', '')).toBeNull()
    expect(legacyTarget('/', '#main-content')).toBeNull()
  })
})

describe('paramsOf', () => {
  it('takes both forms', () => {
    expect(paramsOf('#focus=Mars')).toBe('focus=Mars')
    expect(paramsOf('#orrery?focus=Mars')).toBe('focus=Mars')
    expect(paramsOf('#orrery')).toBe('')
    expect(paramsOf('')).toBe('')
  })
})

describe('viewPath', () => {
  it('is the path of each view', () => {
    expect(viewPath('earth')).toBe('/')
    expect(viewPath('orrery')).toBe('/orrery/')
  })
})

describe('readLocation', () => {
  it('rewrites an old link in place before reading it, keeping history.state', () => {
    window.history.replaceState({ keep: 1 }, '', '/#orrery?focus=jupiter')
    const before = window.history.length
    expect(readLocation()).toEqual({ view: 'orrery', params: 'focus=jupiter' })
    expect(window.location.pathname + window.location.hash).toBe('/orrery/#focus=jupiter')
    expect(window.history.state).toEqual({ keep: 1 })
    expect(window.history.length).toBe(before)
  })

  it('keeps the query string', () => {
    window.history.replaceState(null, '', '/?utm=x#sun')
    readLocation()
    expect(window.location.pathname + window.location.search).toBe('/sun/?utm=x')
  })
})

describe('navigate and subscribeLocation', () => {
  it('pushes the url and tells subscribers', () => {
    const cb = vi.fn()
    const off = subscribeLocation(cb)
    navigate('/sky/#target=sbc:1', { state: { skyFrom: 'orrery' } })
    expect(window.location.pathname + window.location.hash).toBe('/sky/#target=sbc:1')
    expect(window.history.state).toEqual({ skyFrom: 'orrery' })
    expect(cb).toHaveBeenCalledTimes(1)
    off()
    navigate('/sun/')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('rewrites an old hash typed in place, then calls back', () => {
    const seen: string[] = []
    const off = subscribeLocation(() => seen.push(window.location.pathname))
    window.history.replaceState(null, '', '/orrery/')
    window.location.hash = '#sky?target=sbc:1'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    off()
    expect(seen).toContain('/sky/')
    expect(window.location.hash).toBe('#target=sbc:1')
  })

  it('replaces instead of pushing when asked', () => {
    const before = window.history.length
    navigate('/sun/', { replace: true })
    expect(window.history.length).toBe(before)
  })
})

describe('isModifiedClick', () => {
  const click = (init: Partial<MouseEvent>) =>
    ({
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      ...init,
    }) as MouseEvent
  it('lets the browser have modified and non-primary clicks', () => {
    expect(isModifiedClick(click({}))).toBe(false)
    expect(isModifiedClick(click({ metaKey: true }))).toBe(true)
    expect(isModifiedClick(click({ ctrlKey: true }))).toBe(true)
    expect(isModifiedClick(click({ shiftKey: true }))).toBe(true)
    expect(isModifiedClick(click({ button: 1 }))).toBe(true)
  })
})
