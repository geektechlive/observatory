import type { PLAYBACK_RATES } from '@/store/orreryClock'

/** One of the time bar's play speeds, in simulated seconds per wall second. */
export type PlaybackRate = (typeof PLAYBACK_RATES)[number]

/** What each rate button shows: short, so seven fit one row (#114). Its name is RATE_LABEL. */
export const RATE_SHORT: Record<PlaybackRate, string> = {
  1: '1×',
  60: 'min/s',
  3600: 'h/s',
  86_400: 'day/s',
  604_800: 'wk/s',
  2_592_000: 'mo/s',
  31_536_000: 'yr/s',
}

/** Each rate's full name: the time bar's button names, and the guide's "Play at" (#163). */
export const RATE_LABEL: Record<PlaybackRate, string> = {
  1: '1×',
  60: '1 min/s',
  3600: '1 h/s',
  86_400: '1 day/s',
  604_800: '1 wk/s',
  2_592_000: '1 mo/s',
  31_536_000: '1 yr/s',
}
