import { skyUrl } from '@/lib/sky/skyLink'
import { navigate } from '@/lib/viewRoute'
import { type ClockAnchor, simTimeAt } from '@/store/orreryClock'

import { clockIsLive } from './orreryLink'

/**
 * The address (path and hash) of the sky view for an orrery object (#99 item 5, owner decision 5): it
 * uses the orrery's clock, so a clock that is scrubbed or running fast travels in `t`
 * (the moment it shows when the button is pressed); one at real time carries none and
 * the view stays live. The view's "Now" button drops `t`; it does not touch this clock.
 */
export function skyViewUrl(key: string, clock: ClockAnchor, wallNow: number): string {
  return skyUrl({
    target: key,
    t: clockIsLive(clock, wallNow) ? null : simTimeAt(clock, wallNow),
  })
}

/**
 * Opens the Sky console on an orrery object. The history entry is marked `skyFrom: 'orrery'`
 * so the view can say its time is the orrery's at the press; a pasted copy of the address
 * has no such mark and is described as a plain moment. `navigate` tells the dial's
 * listener, which switches consoles.
 */
export function openSkyView(key: string, clock: ClockAnchor, wallNow: number): void {
  navigate(skyViewUrl(key, clock, wallNow), { state: { skyFrom: 'orrery' } })
}
