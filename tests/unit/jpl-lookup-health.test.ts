import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useLookupHealth } from '@/hooks/useJplLookup'
import type { LookupState } from '@/lib/api/jplLookup'
import { useUiStore } from '@/store/ui'

// The orrery search's answers report health like every polled source (#148).

const health = () => useUiStore.getState().sourceHealth

beforeEach(() => {
  useUiStore.setState({ sourceHealth: {} })
})

afterEach(cleanup)

describe('useLookupHealth (#148)', () => {
  it('grades an answer by its contract', () => {
    const answer: LookupState<unknown> = {
      state: 'ok',
      data: { query: 'eros', provider: 'jpl-sbdb', result: { type: 'none' } },
    }
    renderHook(() => {
      useLookupHealth('jpl-lookup', answer)
    })
    expect(health()['jpl-lookup']).toBe('ok')
  })

  it('reports a failed answer as an error', () => {
    renderHook(() => {
      useLookupHealth('jpl-trajectory', { state: 'unavailable', reason: 'failed' })
    })
    expect(health()['jpl-trajectory']).toBe('error')
  })

  it('reports nothing for a busy queue, a missing binding or an object JPL lacks', () => {
    for (const reason of ['busy', 'not-set-up', 'not-found', 'out-of-range'] as const) {
      renderHook(() => {
        useLookupHealth('jpl-trajectory', { state: 'unavailable', reason })
      })
    }
    expect(health()['jpl-trajectory']).toBeUndefined()
  })
})
