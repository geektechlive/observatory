/**
 * The Sun stage shows when its image was observed (#73): the 1.12x zoom crops SDO's own
 * burned-in stamp. Hooks are mocked; the time rules are covered in sdo-times.test.ts.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SunStage } from '@/components/stage/SunStage'

const state = vi.hoisted((): { times: unknown } => ({ times: null }))

vi.mock('@/hooks/useSdoTimes', () => ({ useSdoTimes: () => state.times }))
vi.mock('@/hooks/useSolarActivity', () => ({ useSolarActivity: () => ({ data: undefined }) }))
vi.mock('@/hooks/useImageBucket', () => ({ useImageBucket: () => 1 }))

afterEach(cleanup)

const TIMES = {
  '0171': '2026-10-25T16:46:22Z',
  '0193': '2026-10-25T16:46:05Z',
  '0211': '2026-10-25T16:45:59Z',
  '0304': null,
  HMIB: '2026-10-25T16:15:00Z',
}

describe('SunStage observation time', () => {
  it('labels the image with its own observation time, and follows the wavelength', () => {
    state.times = { data: { times: TIMES, updatedAt: '' } }
    render(<SunStage />)
    const time = screen.getByText(/16:46 UT/)
    expect(time.closest('time')?.getAttribute('dateTime')).toBe('2026-10-25T16:46:22Z')

    fireEvent.click(screen.getByRole('button', { name: 'Composite' }))
    expect(screen.getByText(/16:45 UT/)).toBeTruthy()
  })

  it('shows no time rather than a wrong one when the channel has none', () => {
    state.times = { data: { times: TIMES, updatedAt: '' } }
    render(<SunStage />)
    fireEvent.click(screen.getByRole('button', { name: '304Å' }))
    expect(document.querySelector('time')).toBeNull()
  })

  it('shows no time while the times are unavailable', () => {
    state.times = { data: undefined }
    render(<SunStage />)
    expect(document.querySelector('time')).toBeNull()
  })
})
