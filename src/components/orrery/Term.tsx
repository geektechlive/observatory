import { type KeyboardEvent, type ReactNode, useId, useState } from 'react'

import type { GlossaryEntry, GlossaryId } from '@/lib/orrery/glossary'

import styles from './orrery.module.css'

interface TermProps {
  id: GlossaryId
  children: ReactNode
}

/**
 * A word in the inspector with its plain definition one press away (#159). The glossary is
 * fetched on the first press, not with the page, so the inspector pays nothing for terms
 * nobody asks about. The same entries feed the guide drawer.
 */
export function Term({ id, children }: TermProps) {
  const noteId = useId()
  const [open, setOpen] = useState(false)
  const [entry, setEntry] = useState<GlossaryEntry | null>(null)

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && entry === null) {
      void import('@/lib/orrery/glossary').then((m) => {
        setEntry(m.glossaryEntry(id))
      })
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !open) return
    e.stopPropagation()
    setOpen(false)
  }

  return (
    <span className={styles.term ?? ''}>
      <button
        type="button"
        className={styles.termBtn ?? ''}
        aria-expanded={open}
        aria-describedby={open && entry ? noteId : undefined}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        {children}
      </button>
      {open && entry && (
        <span id={noteId} role="note" className={styles.termNote ?? ''}>
          <strong className={styles.termName ?? ''}>{entry.term}.</strong> {entry.short}
        </span>
      )}
    </span>
  )
}
