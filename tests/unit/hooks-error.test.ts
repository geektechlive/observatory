import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api/apod')
vi.mock('@/lib/api/donki')
vi.mock('@/lib/api/epic')
vi.mock('@/lib/api/fireball')
vi.mock('@/lib/api/launches')
vi.mock('@/lib/api/neo')
vi.mock('@/lib/api/sentry')
vi.mock('@/lib/api/solarWind')

import { useApod } from '@/hooks/useApod'
import { useDonki } from '@/hooks/useDonki'
import { useEpic } from '@/hooks/useEpic'
import { useFireball } from '@/hooks/useFireball'
import { useLaunches } from '@/hooks/useLaunches'
import { useNeo } from '@/hooks/useNeo'
import { useSentry } from '@/hooks/useSentry'
import { useSolarWind } from '@/hooks/useSolarWind'
import { fetchApod } from '@/lib/api/apod'
import { fetchDonki } from '@/lib/api/donki'
import { fetchEpic } from '@/lib/api/epic'
import { fetchFireball } from '@/lib/api/fireball'
import { fetchLaunchesEnvelope } from '@/lib/api/launches'
import { fetchNeoEnvelope } from '@/lib/api/neo'
import { fetchSentry } from '@/lib/api/sentry'
import { fetchSolarWindEnvelope } from '@/lib/api/solarWind'

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

afterEach(() => {
  vi.clearAllMocks()
})

// zod 4's ZodError is not `instanceof Error` (src/lib/toError.ts), so the hooks' old
// `new Error(String(e))` turned a schema failure into "[object Object]" (#113).
describe('a non-Error rejection keeps its message', () => {
  const zodLike = { name: 'ZodError', message: 'expected number at bodies[0].x' }
  const cases = [
    ['useApod', useApod, fetchApod],
    ['useDonki', useDonki, fetchDonki],
    ['useEpic', useEpic, fetchEpic],
    ['useFireball', useFireball, fetchFireball],
    ['useLaunches', useLaunches, fetchLaunchesEnvelope],
    ['useNeo', useNeo, fetchNeoEnvelope],
    ['useSentry', useSentry, fetchSentry],
    ['useSolarWind', useSolarWind, fetchSolarWindEnvelope],
  ] as const

  it.each(cases)('%s', async (_name, hook, fetcher) => {
    vi.mocked(fetcher).mockRejectedValue(zodLike)
    const { result } = renderHook(() => hook(), { wrapper: createWrapper() })
    await waitFor(() => {
      expect(result.current.error).not.toBeNull()
    })
    expect(result.current.error?.message).toBe(zodLike.message)
  })
})
