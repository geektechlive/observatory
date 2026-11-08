import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createOrreryLinkPreload,
  createOrreryPrefetch,
  isOrreryHash,
  scheduleOrreryIdlePrefetch,
  shouldPrefetchOnIdle,
} from '@/lib/orreryPrefetch'

// #168: the orrery's page and renderer (with three.js, which the renderer's own preload
// list brings along) used to arrive in two hops, the second only once the first had run.
// Starting both together, before React renders, leaves no chain.
describe('isOrreryHash', () => {
  it('reads the orrery address in the forms the app writes', () => {
    for (const hash of ['#orrery', '#/orrery', '#ORRERY', '#orrery?t=2012-08-25&focus=naif:-31']) {
      expect(isOrreryHash(hash)).toBe(true)
    }
  })

  it('rejects every other address', () => {
    for (const hash of ['', '#', '#earth', '#earth?layers=quakes', '#orreryx', '#sky?x=orrery']) {
      expect(isOrreryHash(hash)).toBe(false)
    }
  })
})

describe('createOrreryPrefetch', () => {
  it('starts the page and the renderer together, before either has arrived', () => {
    const page = vi.fn(() => new Promise<unknown>(() => undefined))
    const renderer = vi.fn(() => new Promise<unknown>(() => undefined))
    void createOrreryPrefetch({ page, renderer })()
    expect(page).toHaveBeenCalledTimes(1)
    expect(renderer).toHaveBeenCalledTimes(1)
  })

  it('loads once however often it is asked', async () => {
    const page = vi.fn(() => Promise.resolve({}))
    const renderer = vi.fn(() => Promise.resolve({}))
    const prefetch = createOrreryPrefetch({ page, renderer })
    await Promise.all([prefetch(), prefetch()])
    await prefetch()
    expect(page).toHaveBeenCalledTimes(1)
    expect(renderer).toHaveBeenCalledTimes(1)
  })

  it('never rejects, and tries again after a failure', async () => {
    const page = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({})
    const renderer = vi.fn(() => Promise.resolve({}))
    const prefetch = createOrreryPrefetch({ page, renderer })
    await expect(prefetch()).resolves.toBeUndefined()
    await prefetch()
    expect(page).toHaveBeenCalledTimes(2)
  })
})

describe('shouldPrefetchOnIdle', () => {
  it('skips visitors who asked to save data or are on a slow link', () => {
    expect(shouldPrefetchOnIdle({ saveData: true })).toBe(false)
    expect(shouldPrefetchOnIdle({ effectiveType: '2g' })).toBe(false)
    expect(shouldPrefetchOnIdle({ effectiveType: 'slow-2g' })).toBe(false)
  })

  it('allows an ordinary or unknown connection', () => {
    expect(shouldPrefetchOnIdle(undefined)).toBe(true)
    expect(shouldPrefetchOnIdle({})).toBe(true)
    expect(shouldPrefetchOnIdle({ effectiveType: '4g', saveData: false })).toBe(true)
  })
})

describe('scheduleOrreryIdlePrefetch', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits for the page to settle, then runs once', () => {
    vi.useFakeTimers()
    const prefetch = vi.fn(() => Promise.resolve())
    scheduleOrreryIdlePrefetch(prefetch, { connection: undefined, idleDelayMs: 3000 })
    expect(prefetch).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2999)
    expect(prefetch).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5000)
    expect(prefetch).toHaveBeenCalledTimes(1)
  })

  it('does nothing when cancelled or when the visitor is saving data', () => {
    vi.useFakeTimers()
    const prefetch = vi.fn(() => Promise.resolve())
    const cancel = scheduleOrreryIdlePrefetch(prefetch, {
      connection: undefined,
      idleDelayMs: 1000,
    })
    cancel()
    scheduleOrreryIdlePrefetch(prefetch, { connection: { saveData: true }, idleDelayMs: 1000 })
    vi.advanceTimersByTime(10_000)
    expect(prefetch).not.toHaveBeenCalled()
  })
})

// Hover and idle must not evaluate the orrery's modules (no main-thread work on a phone):
// they inject <link rel="modulepreload">, which downloads and compiles but does not run.
describe('createOrreryLinkPreload', () => {
  const manifest = {
    files: ['/assets/OrreryPage-a.js', '/assets/OrreryRenderer-b.js', '/assets/three.module-c.js'],
  }

  afterEach(() => {
    document.head.innerHTML = ''
  })

  it('adds one modulepreload link per chunk, without importing anything', async () => {
    const fetchManifest = vi.fn(() => Promise.resolve(manifest))
    await createOrreryLinkPreload({ fetchManifest, doc: document })()
    const links = [...document.head.querySelectorAll('link[rel="modulepreload"]')]
    expect(links.map((l) => l.getAttribute('href'))).toEqual(manifest.files)
    expect(links.every((l) => l.getAttribute('crossorigin') === '')).toBe(true)
  })

  it('does it once, and skips files the page already preloads', async () => {
    const existing = document.createElement('link')
    existing.rel = 'modulepreload'
    existing.href = '/assets/three.module-c.js'
    document.head.append(existing)
    const fetchManifest = vi.fn(() => Promise.resolve(manifest))
    const preload = createOrreryLinkPreload({ fetchManifest, doc: document })
    await Promise.all([preload(), preload()])
    await preload()
    expect(fetchManifest).toHaveBeenCalledTimes(1)
    expect(document.head.querySelectorAll('link[rel="modulepreload"]')).toHaveLength(3)
  })

  it('never rejects on a missing or malformed manifest, and tries again later', async () => {
    const fetchManifest = vi
      .fn()
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce({ nope: true })
      .mockResolvedValue(manifest)
    const preload = createOrreryLinkPreload({ fetchManifest, doc: document })
    await expect(preload()).resolves.toBeUndefined()
    await expect(preload()).resolves.toBeUndefined()
    expect(document.head.querySelectorAll('link')).toHaveLength(0)
    await preload()
    expect(document.head.querySelectorAll('link')).toHaveLength(3)
  })
})
