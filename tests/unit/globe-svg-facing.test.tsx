/**
 * The SVG globe opens on the evening terminator, like the WebGL globe (#62), so the
 * first paint already shows the day/night line and the crossfade has nothing to jump.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Globe } from '@/components/globe/Globe'
import { terminatorFacing } from '@/lib/globe3d'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SVG Globe start facing (#62)', () => {
  it('reports the evening-terminator longitude on first paint', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const now = new Date('2026-10-19T02:19:00Z')
    vi.setSystemTime(now)
    const onFacingChange = vi.fn()
    render(<Globe size={460} autoRotate={false} onFacingChange={onFacingChange} />)
    expect(onFacingChange).toHaveBeenCalled()
    expect(onFacingChange.mock.calls[0]?.[0]).toBeCloseTo(terminatorFacing(now), 6)
  })
})
