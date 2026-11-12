import { readdirSync, readFileSync } from 'fs'
import { join, relative } from 'path'
import { describe, expect, it } from 'vitest'

/**
 * Panels decide loading / unavailable / data through `panelView` (#222). A panel that
 * checks `error || !data` first hides good data TanStack still holds once a refetch
 * fails, which is the stale-while-revalidate bug #222 fixed in 25 panels at once.
 */

/** `error || !data` and `!data || error`, with any prefix on either name. */
const ERROR_BEFORE_DATA = /\berror\s*\|\|\s*!\s*\w*[dD]ata\b|!\s*\w*[dD]ata\s*\|\|\s*\w*[eE]rror\b/

const ROOT = join(__dirname, '..', '..')
const COMPONENTS = join(ROOT, 'src', 'components')

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return tsxFiles(path)
    return e.name.endsWith('.tsx') ? [path] : []
  })
}

const files = tsxFiles(COMPONENTS).map((path) => ({
  name: relative(ROOT, path),
  src: readFileSync(path, 'utf8'),
}))

describe('panels keep their data when a refetch fails (#222)', () => {
  it('no component checks a query error before its data', () => {
    const offenders = files.filter(({ src }) => ERROR_BEFORE_DATA.test(src)).map(({ name }) => name)
    expect(offenders).toEqual([])
  })

  it("no component reads a query's isLoading itself: panelView decides", () => {
    // SunStage and SunImageryPanel show "unavailable" for an image that failed to load,
    // not for a query, so the rule keys on isLoading rather than on the state.
    const offenders = files.filter(({ src }) => /\bisLoading\b/.test(src)).map(({ name }) => name)
    expect(offenders).toEqual([])
  })
})
