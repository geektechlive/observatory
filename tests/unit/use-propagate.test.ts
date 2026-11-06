/**
 * satellite.js on first use (#97): the propagation module loads only once a hook has
 * orbit data, and every later consumer gets the same module at once.
 */
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { usePropagate } from '@/hooks/usePropagate'
import { loadedPropagate, loadPropagate } from '@/lib/orbit/loadPropagate'

describe('usePropagate (#97)', () => {
  afterEach(cleanup)

  it('stays null while nothing needs SGP4', () => {
    const { result } = renderHook(() => usePropagate(false))
    expect(result.current).toBeNull()
  })

  it('loads the propagation module once needed, and shares it', async () => {
    const { result } = renderHook(() => usePropagate(true))
    await waitFor(() => {
      expect(result.current).not.toBeNull()
    })
    expect(typeof result.current?.propagateIss).toBe('function')
    // One import for everyone: the loader and the cache hand back the same module.
    expect(await loadPropagate()).toBe(result.current)
    expect(loadedPropagate()).toBe(result.current)
    // A consumer mounting later starts with it, without waiting.
    const later = renderHook(() => usePropagate(true))
    expect(later.result.current).toBe(result.current)
  })
})
