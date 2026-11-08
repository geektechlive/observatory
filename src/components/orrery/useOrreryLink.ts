import { useEffect, useRef, useState } from 'react'

import { lookupSpkid } from '@/lib/orrery/lookupTrack'
import { simTimeAt, useOrreryClock } from '@/store/orreryClock'

import { DEFAULT_PRESET } from './defaultView'
import {
  clockIsLive,
  type OrreryLink,
  parseOrreryLink,
  resolveFocus,
  serialiseOrreryLink,
} from './orreryLink'
import { satIdFromFocus, satLinkStep } from './satLink'
import type { FocusPreset, OrreryRenderer, SceneKey } from './three/OrreryRenderer'

/** A scrub is many clock changes in a row; the address is written once it settles. */
const CLOCK_SETTLE_MS = 400

interface LinkOptions {
  renderer: OrreryRenderer | null
  /** `available`: data covers the date (catalog.ts); a looked-up object waits for it. */
  catalog: readonly { key: string; label: string; available?: boolean }[]
  /**
   * The bodies have arrived and the close approaches have answered or failed: a focus
   * not in the catalog now is unknown. A failed bodies fetch is not settled, so a shared
   * link waits for the next one instead of losing its focus.
   */
  settled: boolean
  selected: SceneKey | null
  preset: FocusPreset | null
  select: (key: SceneKey) => void
  applyPreset: (preset: FocusPreset) => void
  /**
   * A link to an object looked up at JPL (`lookup:<SPK-ID>`, #145) asks for it here; its
   * catalog entry appears once JPL answers. `lookupFailed`: JPL said no for good.
   */
  requestLookup: (spkid: string) => void
  lookupFailed: boolean
  /**
   * A link to a satellite (`sat:<NORAD id>`, #158) opens the Earth orbit view, waits for
   * its group, and widens to every group once if it isn't in the loaded ones (see
   * satLinkStep). `version` changes whenever the loaded satellites do.
   */
  sats: {
    has: (key: string) => boolean
    settled: boolean
    allOn: boolean
    version: unknown
    openOrbit: () => void
    widen: () => void
    /** Puts the switches back as they were before `widen`, keeping the found satellite's group. */
    restore: (focus: string | null) => void
  }
}

const onOrrery = () => /^#\/?orrery(\?|$)/i.test(window.location.hash)

/** What a link asks for that has not been applied yet. */
type Pending = Pick<OrreryLink, 'focus' | 'preset'>

/**
 * The orrery's shareable link (#108, format in orreryLink.ts). On load, and when the
 * address is edited, it sets the clock (paused), then the preset or the focus once the
 * renderer and the object are there. After that it writes the address with
 * `replaceState` when the selection, the preset or the clock changes: never per frame,
 * and never a new history entry. The dial tabs still own the view (useHashView).
 */
export function useOrreryLink(o: LinkOptions): void {
  const pending = useRef<Pending | null>(null)
  // The Earth orbit view is opened once per link to a satellite (#158).
  const satOpened = useRef(false)
  // Bumped when the address brings a new link, to run the apply step again.
  const [linkSeq, setLinkSeq] = useState(0)
  const latest = useRef(o)
  useEffect(() => {
    latest.current = o
  })

  // The address from the page's state. Nothing is written while a link is still being
  // applied, or the page's defaults would overwrite it.
  const write = useRef(() => {
    if (pending.current || !onOrrery()) return
    const { selected: focus, preset: view } = latest.current
    const wallNow = Date.now()
    const clock = useOrreryClock.getState()
    const next = serialiseOrreryLink({
      t: clockIsLive(clock, wallNow) ? null : simTimeAt(clock, wallNow),
      focus,
      // The camera's preset, kept beside a selection (choosing a preset leaves the
      // inspector open). The opening view needs no mention on its own.
      preset: view !== null && (focus !== null || view !== DEFAULT_PRESET) ? view : null,
    })
    if (window.location.hash !== next) window.history.replaceState(window.history.state, '', next)
  })

  // Read the address now and whenever it is edited by hand.
  useEffect(() => {
    const read = () => {
      if (!onOrrery()) return
      const link = parseOrreryLink(window.location.hash)
      if (link.t !== null) {
        // Pause first, then set: the clock must not run on between the two (#121).
        const clock = useOrreryClock.getState()
        clock.pause()
        clock.setSimTime(link.t)
      }
      if (link.focus !== null || link.preset !== null) {
        pending.current = { focus: link.focus, preset: link.preset }
        satOpened.current = false
        setLinkSeq((n) => n + 1)
      }
    }
    read()
    window.addEventListener('hashchange', read)
    return () => {
      window.removeEventListener('hashchange', read)
    }
  }, [])

  const { renderer, catalog, settled, lookupFailed } = o
  useEffect(() => {
    const want = pending.current
    if (!want || !renderer) return
    // A looked-up object is fetched for the link (#145), and waits until JPL's samples
    // cover the link's date, so the camera has somewhere to fly; or until JPL says no.
    const spkid = want.focus === null ? null : lookupSpkid(want.focus)
    if (spkid !== null) {
      latest.current.requestLookup(spkid)
      const ready = catalog.some((i) => i.key === want.focus && i.available)
      if (!ready && !lookupFailed) return
    }
    // A satellite (#158) is found among the loaded groups, not the catalog.
    const satId = want.focus === null ? null : satIdFromFocus(want.focus)
    let key: string | null
    if (satId !== null && want.focus !== null) {
      const { sats } = latest.current
      if (!satOpened.current) {
        satOpened.current = true
        sats.openOrbit()
      }
      const step = satLinkStep({
        found: sats.has(want.focus),
        settled: sats.settled,
        allOn: sats.allOn,
      })
      if (step === 'wait') return
      if (step === 'widen') {
        sats.widen()
        return
      }
      key = step === 'select' ? want.focus : null
      sats.restore(key)
    } else {
      key = want.focus === null ? null : resolveFocus(want.focus, catalog)
      if (spkid === null && want.focus !== null && key === null && !settled) return // still loading
    }
    satOpened.current = false
    pending.current = null
    const { select, applyPreset } = latest.current
    // Select first: selecting clears the preset, and a link with both means the camera
    // is on the preset with the inspector open.
    if (key !== null) select(key)
    if (want.preset !== null) applyPreset(want.preset)
    // An unknown focus, or a preset already showing, changes no state: write now.
    write.current()
  }, [renderer, catalog, settled, lookupFailed, linkSeq, o.sats.version, o.sats.allOn])

  const { selected, preset } = o
  const shown = useRef({ selected, preset })
  useEffect(() => {
    // The apply step clears the link before it selects, so a change seen while a link
    // still waits is the visitor's own choice: it replaces the link.
    const was = shown.current
    shown.current = { selected, preset }
    // The Earth orbit view a satellite link opens itself (#158) is not the visitor's choice.
    const presetChanged = was.preset !== preset && !(satOpened.current && preset === 'orbit')
    if (pending.current && (was.selected !== selected || presetChanged)) {
      pending.current = null
    }
    write.current()
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = useOrreryClock.subscribe(() => {
      clearTimeout(timer)
      timer = setTimeout(write.current, CLOCK_SETTLE_MS)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [selected, preset])
}
