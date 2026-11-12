import { type SourceName, SOURCES } from '@/lib/health'

/** The slice of a TanStack query result a panel decides on. */
export interface PanelQuery<T> {
  data: T | undefined
  error: unknown
  isLoading: boolean
  /** When the client received the data, ms. The fallback age when the data has no time. */
  dataUpdatedAt?: number | undefined
}

/** What the nameplate's age stamp (`DataAge`) needs; spread it straight in. */
export interface PanelAge {
  /** One basis for every panel: the data's own `updatedAt`, else when it arrived. 0 is unknown. */
  updatedAt: number
  refreshFailed: boolean
  /** The source's contract age (`SOURCES`); past it the stamp shows the age in plain sight. */
  maxAgeMs: number | undefined
}

/**
 * What a data panel shows (#222). Data wins whenever there is some: TanStack keeps the
 * last good answer when a refetch fails, and stale-while-revalidate (#83) means the panel
 * keeps showing it, marked `refreshFailed`. The error state is only for no data at all,
 * and loading only for no data while the first fetch is in flight. A query that is
 * neither (disabled, or paused offline) reads as unavailable, never a spinner forever.
 */
export type PanelView<T> =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; data: T; refreshFailed: boolean; age: PanelAge }

/** The server's time for the data, when the payload carries a parseable `updatedAt`. */
function dataTime(data: unknown): number | null {
  if (typeof data !== 'object' || data === null || !('updatedAt' in data)) return null
  const at = typeof data.updatedAt === 'string' ? Date.parse(data.updatedAt) : NaN
  return Number.isFinite(at) ? at : null
}

export function panelView<T>(
  { data, error, isLoading, dataUpdatedAt }: PanelQuery<T>,
  source?: SourceName,
): PanelView<T> {
  if (data !== undefined && data !== null) {
    const refreshFailed = error != null
    const age = {
      updatedAt: dataTime(data) ?? dataUpdatedAt ?? 0,
      refreshFailed,
      maxAgeMs: source === undefined ? undefined : SOURCES[source].maxAgeMs,
    }
    return { kind: 'ready', data, refreshFailed, age }
  }
  if (error == null && isLoading) return { kind: 'loading' }
  return { kind: 'unavailable' }
}
