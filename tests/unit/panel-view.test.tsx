/**
 * Stale-while-revalidate in the panels (#222, #83). TanStack keeps a query's last good
 * data when a refetch fails, so a panel that checked `error || !data` first swapped good
 * data for "Data unavailable". `panelView` decides once for every panel, and `DataAge`
 * carries the quiet "couldn't refresh" mark in the nameplate, where it can't move layout.
 * Past the source's `maxAgeMs` the mark puts the age in plain sight.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { DataAge } from '@/components/ui/DataAge'
import { SOURCES } from '@/lib/health'
import { panelView } from '@/lib/panelView'

afterEach(cleanup)

const failed = new Error('503')
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

describe('panelView', () => {
  it('shows the data when it has data and nothing failed', () => {
    expect(panelView({ data: { n: 1 }, error: null, isLoading: false })).toMatchObject({
      kind: 'ready',
      data: { n: 1 },
      refreshFailed: false,
    })
  })

  it('keeps the data, marked, when a refetch fails after a good answer', () => {
    expect(panelView({ data: { n: 1 }, error: failed, isLoading: false })).toMatchObject({
      kind: 'ready',
      data: { n: 1 },
      refreshFailed: true,
    })
  })

  it('shows the error only when there is no data at all', () => {
    expect(panelView({ data: undefined, error: failed, isLoading: false })).toEqual({
      kind: 'unavailable',
    })
  })

  it('shows loading only with no data and nothing failed', () => {
    expect(panelView({ data: undefined, error: null, isLoading: true })).toEqual({
      kind: 'loading',
    })
  })

  it('a query that is neither loading nor holding data (disabled) is unavailable, not a spinner', () => {
    expect(panelView({ data: undefined, error: null, isLoading: false })).toEqual({
      kind: 'unavailable',
    })
  })

  it('keeps falsy-but-real data such as 0 or an empty list', () => {
    expect(panelView({ data: 0, error: null, isLoading: false })).toMatchObject({ kind: 'ready' })
    expect(panelView({ data: [], error: failed, isLoading: false })).toMatchObject({
      kind: 'ready',
      refreshFailed: true,
    })
  })

  it("dates the data by its own updatedAt, the server's time, when it has one", () => {
    const view = panelView({
      data: { updatedAt: '2026-11-08T15:25:46.000Z' },
      error: null,
      isLoading: false,
      dataUpdatedAt: Date.UTC(2026, 10, 12),
    })
    expect(view).toMatchObject({ age: { updatedAt: Date.UTC(2026, 10, 8, 15, 25, 46) } })
  })

  it("falls back to the query's receive time when the data carries no time", () => {
    const view = panelView({ data: { n: 1 }, error: null, isLoading: false, dataUpdatedAt: 1234 })
    expect(view).toMatchObject({ age: { updatedAt: 1234 } })
    const unparsable = panelView({
      data: { updatedAt: 'not a date' },
      error: null,
      isLoading: false,
      dataUpdatedAt: 99,
    })
    expect(unparsable).toMatchObject({ age: { updatedAt: 99 } })
  })

  it("carries the source's maxAgeMs and the failure into the stamp's props", () => {
    const view = panelView({ data: { n: 1 }, error: failed, isLoading: false }, 'co2')
    expect(view).toMatchObject({
      age: { refreshFailed: true, maxAgeMs: SOURCES.co2.maxAgeMs },
    })
  })
})

describe('DataAge refresh mark', () => {
  it('shows only the age when the last refresh worked', () => {
    render(<DataAge updatedAt={Date.now() - 5 * MINUTE} />)
    expect(screen.getByText('5m ago')).toBeTruthy()
    expect(screen.queryByText(/couldn't refresh/)).toBeNull()
  })

  it('shows a quiet "couldn\'t refresh" while the data is within its source\'s age', () => {
    const { container } = render(
      <DataAge updatedAt={Date.now() - 5 * MINUTE} refreshFailed maxAgeMs={DAY} />,
    )
    expect(screen.getByText("couldn't refresh")).toBeTruthy()
    expect(container.querySelector('[data-stale]')).toBeNull()
    expect(container.firstElementChild?.getAttribute('title')).toContain('5m ago')
  })

  it('gives the age to screen readers, keyboard and touch, not only the tooltip', () => {
    const { container } = render(<DataAge updatedAt={Date.now() - 5 * MINUTE} refreshFailed />)
    // Visually hidden text is in the accessible text of the stamp.
    expect(container.textContent).toContain('5m ago')
  })

  it("past the source's maxAgeMs the age is visible, not just the mark", () => {
    render(<DataAge updatedAt={Date.now() - 3 * DAY} refreshFailed maxAgeMs={DAY} />)
    expect(screen.getByText('3d ago · stale')).toBeTruthy()
  })

  it('an age over two days reads in days', () => {
    render(<DataAge updatedAt={Date.now() - 3 * DAY} />)
    expect(screen.getByText('3d ago')).toBeTruthy()
  })

  it('still shows the mark when the age is unknown', () => {
    render(<DataAge updatedAt={0} refreshFailed />)
    expect(screen.getByText("couldn't refresh")).toBeTruthy()
  })

  it('renders nothing with no age and no failure', () => {
    const { container } = render(<DataAge updatedAt={0} />)
    expect(container.textContent).toBe('')
  })
})
