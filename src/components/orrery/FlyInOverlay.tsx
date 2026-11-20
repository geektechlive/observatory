import {
  type KeyboardEvent,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

import { formatRange, targetLook } from '@/lib/orrery/flightTarget'
import type { ModelDescriptor } from '@/lib/orrery/modelDescriptor'

import detail from './detail-view.module.css'
import { DETAIL_VIEW_ID } from './detailViewId'
import styles from './fly-in.module.css'
import { ModelCredit } from './ModelCredit'
import { standInNote } from './standInNote'
import type { FlyInState } from './three/OrreryRenderer'

export interface FlyInOverlayHandle {
  /** The renderer's state this frame: moves the bracket and its range without a render. */
  update(state: FlyInState): void
}

interface FlyInOverlayProps {
  ref?: Ref<FlyInOverlayHandle>
  descriptor: ModelDescriptor
  /** What the model is of: the craft's name. */
  title: string
  /** Moons near the craft with no data for the date, named so their absence is explained. */
  omitted: readonly string[]
  /** Back to orrery, Escape, or a push out at the zoom-out wall. */
  onBack: () => void
  /** Turn (radians) and zoom (a distance factor) the camera, from the keyboard or the buttons. */
  onNudge: (dAzimuth: number, dPolar: number, zoom: number) => void
}

/** One arrow-key press turns the view this far, radians (about 7 degrees), as the studio's does. */
const ROTATE_STEP = 0.12
/** One zoom press moves the camera to this share of its distance (in), or its inverse (out). */
const ZOOM_IN = 0.8

type Spoken = 'flying' | 'arrived' | null

/**
 * The fly-in's controls over the orrery's own stage (#268): Back, zoom, the target bracket and
 * range that mark the craft until its model is plain to see, and the credits. The orrery
 * itself draws the flight; nothing here owns a canvas.
 */
export function FlyInOverlay({
  ref,
  descriptor,
  title,
  omitted,
  onBack,
  onNudge,
}: FlyInOverlayProps) {
  const target = useRef<HTMLDivElement>(null)
  const range = useRef<HTMLSpanElement>(null)
  const back = useRef<HTMLButtonElement>(null)
  const latest = useRef({ onBack })
  const [spoken, setSpoken] = useState<Spoken>(null)

  useEffect(() => {
    latest.current = { onBack }
  })

  useImperativeHandle(
    ref,
    () => ({
      update(state) {
        const el = target.current
        const label = range.current
        if (!el || !label) return
        const t = state.target
        const look = t ? targetLook(t.radiusPx) : { sizePx: 0, opacity: 0 }
        const opacity = (state.phase === 'waiting' ? 0 : look.opacity).toFixed(3)
        // The browser keeps its own form ("1" for "1.000"): compare the numbers.
        if (Number(el.style.opacity || Number.NaN) !== Number(opacity)) el.style.opacity = opacity
        if (t) {
          el.style.setProperty('--target-size', `${look.sizePx.toFixed(1)}px`)
          el.style.setProperty('--target-x', `${t.x.toFixed(1)}px`)
          el.style.setProperty('--target-y', `${t.y.toFixed(1)}px`)
          el.dataset['flyTargetRadius'] = t.radiusPx.toFixed(2)
        }
        const text = t && look.opacity > 0 ? formatRange(t.rangeKm) : ''
        if (label.textContent !== text) label.textContent = text
        const next: Spoken =
          state.phase === 'arrived' ? 'arrived' : state.phase === 'enter' ? 'flying' : null
        setSpoken((s) => (s === next || next === null ? s : next))
      },
    }),
    [],
  )

  // Escape goes back, unless a control used the key (the guide marks it used when it closes
  // itself, #265) or a text field has it.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const t = e.target
      if (t instanceof HTMLElement && t.closest('input, textarea, select, [role="combobox"]'))
        return
      e.preventDefault()
      latest.current.onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    back.current?.focus()
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const turn: Record<string, [number, number]> = {
      ArrowLeft: [-ROTATE_STEP, 0],
      ArrowRight: [ROTATE_STEP, 0],
      ArrowUp: [0, -ROTATE_STEP],
      ArrowDown: [0, ROTATE_STEP],
    }
    const step = turn[e.key]
    if (step) {
      e.preventDefault()
      onNudge(step[0], step[1], 1)
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      onNudge(0, 0, ZOOM_IN)
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      onNudge(0, 0, 1 / ZOOM_IN)
    }
  }

  const note = standInNote(descriptor, title)
  return (
    // A focusable group: arrow keys turn the view about the craft and plus and minus zoom it.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      id={DETAIL_VIEW_ID}
      className={styles.flyIn ?? ''}
      data-fly-in=""
      data-space-owner=""
      role="group"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see above
      tabIndex={0}
      aria-label={`Fly-in to ${title}. Arrow keys turn the view, plus and minus zoom.`}
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - Escape"
      onKeyDown={onKeyDown}
    >
      <div className={styles.flyBar ?? ''}>
        <button
          ref={back}
          type="button"
          className={detail.detailClose ?? ''}
          onClick={() => {
            onBack()
          }}
        >
          Back to orrery
        </button>
        <button
          type="button"
          className={detail.detailZoomBtn ?? ''}
          aria-label="Zoom in"
          onClick={() => {
            onNudge(0, 0, ZOOM_IN)
          }}
        >
          +
        </button>
        <button
          type="button"
          className={detail.detailZoomBtn ?? ''}
          aria-label="Zoom out"
          onClick={() => {
            onNudge(0, 0, 1 / ZOOM_IN)
          }}
        >
          −
        </button>
      </div>
      {/* The camera ship's bracket (#261): the craft is under a pixel until about a km out, so
          a bracket and its range mark it, fading as the model itself grows. Decorative. */}
      <div ref={target} className={styles.flyTarget ?? ''} data-fly-target="" aria-hidden="true">
        <span ref={range} className={styles.flyRange ?? ''} />
      </div>
      <p className={detail.srOnly ?? ''} role="status" data-fly-announce="">
        {spoken === 'flying'
          ? `Flying in to ${title}`
          : spoken === 'arrived'
            ? `Beside ${title}`
            : ''}
      </p>
      {/* A stand-in model says so where it is seen, not behind the link (owner, 2026-11-12). */}
      {note && (
        <p className={`${detail.detailCredit ?? ''} ${styles.flyNote ?? ''}`} data-fly-note="">
          {note}
        </p>
      )}
      {/* Folded behind one link so the stage stays clear (owner, 2026-11-20); the model's
          licence credit is a click away, which CC BY 4.0 3(a)(2) allows. */}
      <details
        className={`${detail.detailCredit ?? ''} ${styles.flyCredit ?? ''}`}
        data-fly-credit=""
      >
        <summary className={styles.flyCreditToggle ?? ''}>Sources, credits and licence</summary>
        <p data-fly-true-scale="">
          True size and distance. Its place is from JPL Horizons, the planets&rsquo; from
          JPL&rsquo;s orbital elements, its size from ESA DISCOS.
          {omitted.length > 0 &&
            ` No data for ${omitted.join(', ')} on this date, so ${omitted.length === 1 ? 'it is' : 'they are'} left out.`}
        </p>
        <ModelCredit descriptor={descriptor} />
      </details>
    </div>
  )
}
