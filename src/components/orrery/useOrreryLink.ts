import { useCallback, useEffect, useRef, useState } from 'react'

import { isDwarfFocus } from '@/lib/orrery/dwarfs'
import { lookupSpkid } from '@/lib/orrery/lookupTrack'
import { isSmallBodyKey } from '@/lib/orrery/smallBodyView'
import { simTimeAt, useOrreryClock } from '@/store/orreryClock'
import { useOrreryView } from '@/store/orreryView'

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
   * Comets, the interstellar objects and the dwarf planets (`sbc:<SPK-ID>`, #99) load only
   * when asked. A link to such a key the catalog lacks, or to a dwarf planet by name
   * (`focus=pluto`), asks for them and waits until they have answered (`settled`): the
   * comets' payload or the dwarf planets' own, whichever the focus needs. No other focus asks.
   */
  smallBodies?: { request: (focus: string) => void; settled: boolean } | undefined
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
  /**
   * Whether the object has a model for the "Look closer" view (#203). A link's `detail`
   * opens the view only when the focus resolved to an object this says yes to; otherwise
   * the focus stays, the inspector opens, and `detail` is dropped from the address.
   */
  hasModel: (key: string) => boolean
  /** Deselect: a guide lesson with no focus (#159) starts from a clean inspector. */
  clearSelection: () => void
}

export interface ApplyLinkOptions {
  /**
   * A lesson or button applying a link, not a pasted address (#159): a link without `t`
   * returns the clock to now, and one without a focus clears the selection, so the scene
   * shows the lesson and not what was open before it.
   */
  fresh?: boolean
}

const onOrrery = () => /^#\/?orrery(\?|$)/i.test(window.location.hash)

/** What a link asks for that has not been applied yet. */
type Pending = Pick<OrreryLink, 'focus' | 'preset' | 'detail'> & { fresh: boolean }

/**
 * The orrery's shareable link (#108, format in orreryLink.ts). On load, and when the
 * address is edited, it sets the clock (paused), then the preset or the focus once the
 * renderer and the object are there. After that it writes the address with
 * `replaceState` when the selection, the preset or the clock changes: never per frame,
 * and never a new history entry. The dial tabs still own the view (useHashView).
 */
export function useOrreryLink(o: LinkOptions): (link: OrreryLink, opts?: ApplyLinkOptions) => void {
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
      // The detail view is always on the selection (the store keeps it so).
      detail: focus !== null && useOrreryView.getState().detail === focus,
      // The camera's preset, kept beside a selection (choosing a preset leaves the
      // inspector open). The opening view needs no mention on its own.
      preset: view !== null && (focus !== null || view !== DEFAULT_PRESET) ? view : null,
    })
    if (window.location.hash !== next) window.history.replaceState(window.history.state, '', next)
  })

  // The one path a link takes into the scene: the address on load and on edit, and the
  // guide's "Show me" (#159). Applying the same link twice works, because the camera is
  // not part of a link and may have moved since.
  const apply = useCallback((link: OrreryLink, opts?: ApplyLinkOptions) => {
    const fresh = opts?.fresh === true
    const clock = useOrreryClock.getState()
    if (link.t !== null) {
      // Pause first, then set: the clock must not run on between the two (#121).
      clock.pause()
      clock.setSimTime(link.t)
    } else if (fresh) {
      clock.resetToNow()
    }
    // A `detail` alone is applied too, only to be dropped from the address.
    if (link.focus !== null || link.preset !== null || link.detail) {
      pending.current = { focus: link.focus, preset: link.preset, detail: link.detail, fresh }
      satOpened.current = false
      setLinkSeq((n) => n + 1)
    }
  }, [])

  // Read the address now and whenever it is edited by hand.
  useEffect(() => {
    const read = () => {
      if (!onOrrery()) return
      apply(parseOrreryLink(window.location.hash))
    }
    read()
    window.addEventListener('hashchange', read)
    return () => {
      window.removeEventListener('hashchange', read)
    }
  }, [apply])

  // Coming back to the tab (#189): the view kept in the store writes its link. The dial's
  // own effect (useHashView) puts the bare `#orrery` in the same commit as this mounts, so
  // the write waits until that has run.
  useEffect(() => {
    const timer = setTimeout(write.current, 0)
    return () => {
      clearTimeout(timer)
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
      const small = latest.current.smallBodies
      const wantsSmall =
        want.focus !== null && (isSmallBodyKey(want.focus) || isDwarfFocus(want.focus))
      if (key === null && small && want.focus !== null && wantsSmall) {
        small.request(want.focus)
        if (!small.settled) return
      }
    }
    satOpened.current = false
    pending.current = null
    const { select, applyPreset, clearSelection } = latest.current
    if (want.fresh && want.focus === null) clearSelection()
    // Select first: selecting clears the preset, and a link with both means the camera
    // is on the preset with the inspector open.
    if (key !== null) select(key)
    if (want.preset !== null) applyPreset(want.preset)
    // The detail view opens last, on the resolved focus, and only if it has a model.
    // Otherwise it is closed: the address no longer asks for it (back to a plain focus).
    const { openDetail, closeDetail } = useOrreryView.getState()
    if (want.detail && key !== null && latest.current.hasModel(key)) openDetail(key)
    else closeDetail()
    // An unknown focus, or a preset already showing, changes no state: write now.
    write.current()
  }, [
    renderer,
    catalog,
    settled,
    lookupFailed,
    linkSeq,
    o.sats.version,
    o.sats.allOn,
    o.smallBodies?.settled,
  ])

  const { selected, preset } = o
  // Opening or closing the detail view rewrites the address (never a new entry).
  const detail = useOrreryView((s) => s.detail)
  const shown = useRef({ selected, preset, detail })
  useEffect(() => {
    // The apply step clears the link before it selects, so a change seen while a link
    // still waits is the visitor's own choice: it replaces the link.
    const was = shown.current
    shown.current = { selected, preset, detail }
    // The Earth orbit view a satellite link opens itself (#158) is not the visitor's choice.
    const presetChanged = was.preset !== preset && !(satOpened.current && preset === 'orbit')
    // The apply step clears the link before it opens or closes the detail view, so a
    // change here while a link waits is the visitor's own.
    if (pending.current && (was.selected !== selected || presetChanged || was.detail !== detail)) {
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
  }, [selected, preset, detail])
  return apply
}
