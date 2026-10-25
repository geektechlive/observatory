/**
 * SelectiveBloom state hygiene (#50). The bloom pass switches the shared camera to the
 * bloom layer; if a draw throws (a lost context, say) and the camera stays there, every
 * later main pass draws only the glow sources. jsdom has no WebGL, but the pass's
 * targets and materials only touch GL on first render, so a throwing fake is enough.
 */
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { SelectiveBloom } from '@/components/globe/three/bloom'

describe('SelectiveBloom', () => {
  it('puts the camera back on its own layers, and the target back to the canvas, when a draw throws', () => {
    const camera = new PerspectiveCamera()
    const before = camera.layers.mask
    const setRenderTarget = vi.fn()
    const renderer = {
      setRenderTarget,
      render: () => {
        throw new Error('context lost')
      },
    } as unknown as WebGLRenderer
    const bloom = new SelectiveBloom(renderer, new Scene(), camera, 64, 64)

    expect(() => {
      bloom.render()
    }).toThrow('context lost')
    expect(camera.layers.mask).toBe(before)
    expect(setRenderTarget).toHaveBeenLastCalledWith(null)
    bloom.dispose()
  })

  it('draws the glow sources at half size, on create and on resize (#69)', () => {
    // The pass's first blur level is half size already, so a full-size input target only
    // cost VRAM (8 bytes a pixel, HalfFloat RGBA).
    const renderer = {} as WebGLRenderer
    const bloom = new SelectiveBloom(renderer, new Scene(), new PerspectiveCamera(), 1360, 1360)
    expect(bloom.debugTargetSize()).toEqual([680, 680])
    bloom.setSize(1001, 640)
    expect(bloom.debugTargetSize()).toEqual([501, 320])
    bloom.dispose()
  })
})
