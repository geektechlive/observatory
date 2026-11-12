/**
 * The guide's lesson bar (#163): a lesson whose tip says "play at 1 day/s" gets a button
 * that does it, so a newcomer need not find the rate buttons first.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OrreryGuide } from '@/components/orrery/guide/OrreryGuide'

vi.mock('@/hooks/useOrreryNeo', () => ({ useOrreryNeo: () => ({ data: undefined }) }))

afterEach(cleanup)

function renderBar(rate: number | undefined, onPlay = vi.fn()) {
  render(
    <OrreryGuide
      mode="compact"
      shown={{ id: 'voyager-1', title: 'Voyager 1', tryIt: 'Watch it.', rate }}
      onShow={vi.fn()}
      onPlay={onPlay}
      onExpand={vi.fn()}
      onClose={vi.fn()}
      onBarHeight={vi.fn()}
    />,
  )
  return onPlay
}

describe('the lesson bar (#163)', () => {
  it('plays at the lesson’s rate when its button is pressed', () => {
    const onPlay = renderBar(86_400)
    fireEvent.click(screen.getByRole('button', { name: 'Play at 1 day/s' }))
    expect(onPlay).toHaveBeenCalledWith(86_400)
  })

  it('names an hour-a-second rate the way the time bar does', () => {
    renderBar(3600)
    expect(screen.getByRole('button', { name: 'Play at 1 h/s' })).toBeTruthy()
  })

  it('shows no play button for a lesson without a rate', () => {
    renderBar(undefined)
    expect(screen.queryByRole('button', { name: /^Play at/ })).toBeNull()
  })
})
