/** The wait for the detail view's chunk (#203 review): Escape works, and a failed import closes it. */
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DetailLoading } from '@/components/orrery/DetailLoading'
import type { DetailView } from '@/components/orrery/DetailView'
import { useDetailViewModule } from '@/components/orrery/useDetailViewModule'

afterEach(cleanup)

describe('<DetailLoading>', () => {
  it('is a status and closes on Escape while the chunk loads', () => {
    const onClose = vi.fn()
    render(<DetailLoading onClose={onClose} />)
    expect(screen.getByRole('status').textContent).toMatch(/loading/i)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('useDetailViewModule', () => {
  const View: typeof DetailView = () => <div />

  it('stays null until wanted, then returns the component once the import resolves', async () => {
    const importer = vi.fn(() => Promise.resolve({ DetailView: View }))
    const { result, rerender } = renderHook(
      ({ wanted }) => useDetailViewModule(wanted, () => undefined, importer),
      { initialProps: { wanted: false } },
    )
    expect(result.current).toBeNull()
    expect(importer).not.toHaveBeenCalled()
    rerender({ wanted: true })
    await act(async () => {})
    expect(result.current).toBe(View)
    expect(importer).toHaveBeenCalledTimes(1)
  })

  it('calls onFail once when the import rejects, so the orrery is never left detached', async () => {
    const onFail = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { result } = renderHook(() =>
      useDetailViewModule(true, onFail, () => Promise.reject(new Error('chunk 404'))),
    )
    await act(async () => {})
    expect(onFail).toHaveBeenCalledTimes(1)
    expect(result.current).toBeNull()
    warn.mockRestore()
  })
})
