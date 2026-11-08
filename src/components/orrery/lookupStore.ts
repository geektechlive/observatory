import { create } from 'zustand'

import type { LookupObject } from '@/schemas/jplLookup'

/**
 * The object looked up at JPL that the orrery shows (#145). The search card's "Show in
 * orrery" puts it here; the page (useLookupTrack) fetches its trajectory and draws it.
 * A shared link asks by SPK-ID alone: the trajectory answer carries the object.
 */
export interface ShownLookup {
  spkid: string
  /** From the lookup card; null until the trajectory answers, for a link. */
  object: LookupObject | null
  /** Fly to it and open the inspector once it is drawn ("Show in orrery"). */
  focusOnLoad: boolean
}

interface LookupStore {
  shown: ShownLookup | null
  show: (object: LookupObject) => void
  request: (spkid: string) => void
  /** The page has focused it. */
  focused: () => void
  clear: () => void
}

export const useLookupStore = create<LookupStore>((set) => ({
  shown: null,
  show: (object) => {
    set({ shown: { spkid: object.spkid, object, focusOnLoad: true } })
  },
  request: (spkid) => {
    set((s) =>
      s.shown?.spkid === spkid ? s : { shown: { spkid, object: null, focusOnLoad: false } },
    )
  },
  focused: () => {
    set((s) => (s.shown ? { shown: { ...s.shown, focusOnLoad: false } } : s))
  },
  clear: () => {
    set({ shown: null })
  },
}))
