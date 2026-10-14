import type { ReactNode } from 'react'

import styles from './primitives.module.css'

interface LabelProps {
  /** faint for captions and units, dim for row labels that need a little more weight */
  tone?: 'faint' | 'dim' | undefined
  children: ReactNode
}

/** The micro label: mono caps in quiet ink, for captions, row labels and sub-lines. */
export function Label({ tone = 'faint', children }: LabelProps) {
  return (
    <span className={styles.microLabel ?? ''} data-tone={tone}>
      {children}
    </span>
  )
}
