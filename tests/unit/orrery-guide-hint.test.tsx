import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GuideChip } from '@/components/orrery/GuideChip'
import {
  GUIDE_STORAGE_KEY,
  guideSeen,
  markGuideSeen,
  resetGuideSeenForTests,
} from '@/components/orrery/guideHint'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
beforeEach(() => {
  window.localStorage.clear()
  resetGuideSeenForTests()
})

describe('the first-visit hint (#159)', () => {
  it('is unseen on a first visit, and seen once marked', () => {
    expect(guideSeen()).toBe(false)
    markGuideSeen()
    expect(guideSeen()).toBe(true)
  })

  it('remembers across page loads through localStorage', () => {
    markGuideSeen()
    expect(window.localStorage.getItem(GUIDE_STORAGE_KEY)).not.toBeNull()
    resetGuideSeenForTests()
    expect(guideSeen()).toBe(true)
  })

  it('reads a stored value it does not understand as unseen', () => {
    window.localStorage.setItem(GUIDE_STORAGE_KEY, '{nonsense')
    expect(guideSeen()).toBe(false)
  })

  describe('when storage is blocked (private mode, a policy, a full disk)', () => {
    it('does not throw when the storage getter itself throws, and remembers for the session', () => {
      vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError')
      })
      expect(guideSeen()).toBe(false)
      expect(() => {
        markGuideSeen()
      }).not.toThrow()
      expect(guideSeen()).toBe(true)
    })

    it('does not throw when setItem throws', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('full', 'QuotaExceededError')
      })
      expect(() => {
        markGuideSeen()
      }).not.toThrow()
      expect(guideSeen()).toBe(true)
    })
  })
})

describe('the New here? chip (#159)', () => {
  it('opens the guide and asks to be hidden when pressed', () => {
    const onOpen = vi.fn()
    render(<GuideChip onOpen={onOpen} onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /open the guide/i }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('can be dismissed without opening the guide', () => {
    const onOpen = vi.fn()
    const onDismiss = vi.fn()
    render(<GuideChip onOpen={onOpen} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('is a small note, not a modal', () => {
    render(<GuideChip onOpen={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('note')).toBeTruthy()
  })

  function renderOn(pointer: 'fine' | 'coarse'): string {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({ matches: query === '(pointer: coarse)' && pointer === 'coarse' }) as MediaQueryList,
    )
    render(<GuideChip onOpen={vi.fn()} onDismiss={vi.fn()} />)
    return screen.getByRole('note').textContent
  }

  it('says how to move the view with a mouse (#185)', () => {
    const text = renderOn('fine')
    expect(text).toContain('Drag to turn · Scroll to zoom · Right-drag to slide')
    expect(text).not.toContain('Two fingers')
  })

  it('says how to move the view by touch (#185)', () => {
    const text = renderOn('coarse')
    expect(text).toContain('One finger turns · Pinch zooms · Two fingers slide')
    expect(text).not.toContain('Right-drag')
  })
})
