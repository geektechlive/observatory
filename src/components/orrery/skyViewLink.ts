import { serialiseSkyLink } from '@/lib/sky/skyLink'
import { type ClockAnchor, simTimeAt } from '@/store/orreryClock'

import { clockIsLive } from './orreryLink'

/**
 * The address of the sky view for an orrery object (#99 item 5, owner decision 5): it
 * uses the orrery's clock, so a clock that is scrubbed or running fast travels in `t`
 * (the moment it shows when the button is pressed); one at real time carries none and
 * the view stays live. The view's "Now" button drops `t`; it does not touch this clock.
 */
export function skyViewHash(key: string, clock: ClockAnchor, wallNow: number): string {
  return serialiseSkyLink({
    target: key,
    t: clockIsLive(clock, wallNow) ? null : simTimeAt(clock, wallNow),
  })
}

/**
 * Opens the Sky console on an orrery object. The history entry is marked `skyFrom: 'orrery'`
 * so the view can say its time is the orrery's at the press; a pasted copy of the address
 * has no such mark and is described as a plain moment. `pushState` fires no `hashchange`,
 * and the dial listens for it to switch consoles, so it is sent by hand.
 */
export function openSkyView(key: string, clock: ClockAnchor, wallNow: number): void {
  window.history.pushState({ skyFrom: 'orrery' }, '', skyViewHash(key, clock, wallNow))
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}
