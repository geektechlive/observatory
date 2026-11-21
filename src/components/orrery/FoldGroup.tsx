import { type ReactNode, useEffect, useId, useRef, useState } from 'react'

import styles from './orrery.module.css'
import { type FoldId, foldOpen, JustOnContext, rememberFold, revealNote } from './railFolds'

/** How long a reveal's mark and note stay, ms. */
const REVEAL_MS = 8000

interface FoldGroupProps {
  id: FoldId
  title: string
  /** What is on, shown on the heading: "2 of 3 on", "40 drawn", "Off". */
  readout: string
  /** True when the readout means nothing is on, so it reads fainter. */
  off?: boolean
  /** The labels of the switches on now; one that turns on while folded opens the group. */
  onKeys: readonly string[]
  children: ReactNode
}

/**
 * A layer group of the control rail that folds (#273, direction A). The heading is the
 * button, with what is on beside it, so a folded rail reads as a table of contents. The
 * contents stay mounted while folded, so their state (the satellite browser, Scout's list)
 * survives. A switch in a folded group can't be clicked, so one that turns on while folded
 * was turned on from outside the rail (Find, a link, Show me, a preset): the group opens,
 * marks the row and says so, without moving focus.
 */
export function FoldGroup({ id, title, readout, off = false, onKeys, children }: FoldGroupProps) {
  const [open, setOpen] = useState(() => foldOpen(id))
  const [revealed, setRevealed] = useState<readonly string[]>([])
  const bodyId = useId()
  const section = useRef<HTMLElement>(null)
  const before = useRef(onKeys)
  const keys = onKeys.join('\n')

  useEffect(() => {
    const was = new Set(before.current)
    before.current = keys === '' ? [] : keys.split('\n')
    const added = before.current.filter((k) => !was.has(k))
    if (added.length === 0 || open) return
    setOpen(true)
    setRevealed(added)
    // Only when the rail is on screen: on a phone the sheet has closed, and scrolling a
    // hidden rail would move the page instead.
    const el = section.current
    if (el && typeof el.checkVisibility === 'function' && el.checkVisibility()) {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [keys, open])

  // The mark and note last REVEAL_MS from when the group is first on screen, not from the
  // reveal: on a phone the sheet is closed then, and the visitor opens it later.
  useEffect(() => {
    const el = section.current
    if (revealed.length === 0 || !el) return
    let timer: number | undefined
    const start = () => {
      timer ??= window.setTimeout(() => {
        setRevealed([])
      }, REVEAL_MS)
    }
    if (typeof IntersectionObserver !== 'function') {
      start()
      return () => {
        window.clearTimeout(timer)
      }
    }
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) start()
    })
    seen.observe(el)
    return () => {
      seen.disconnect()
      window.clearTimeout(timer)
    }
  }, [revealed])

  return (
    <section ref={section} className={`${styles.group ?? ''} ${styles.fold ?? ''}`}>
      <h2 className={styles.groupTitle ?? ''}>
        <button
          type="button"
          className={styles.foldBtn ?? ''}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => {
            const next = !open
            setOpen(next)
            setRevealed([])
            rememberFold(id, next)
          }}
        >
          <span className={styles.foldChevron ?? ''} aria-hidden="true" />
          <span className={styles.foldTitle ?? ''}>{title}</span>
          <span className={styles.foldReadout ?? ''} data-off={off || undefined}>
            {readout}
          </span>
        </button>
      </h2>
      {/* Always present, so a screen reader hears the note when its text arrives. */}
      <p className={styles.revealNote ?? ''} role="status">
        {revealed.length > 0 ? revealNote(revealed) : ''}
      </p>
      <div id={bodyId} className={styles.foldBody ?? ''} hidden={!open}>
        <JustOnContext.Provider value={revealed}>{children}</JustOnContext.Provider>
      </div>
    </section>
  )
}
