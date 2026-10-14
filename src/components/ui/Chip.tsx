import type { ReactNode } from 'react'

import styles from './primitives.module.css'

interface ChipProps {
  pressed: boolean
  onClick: () => void
  children: ReactNode
}

/** A two-state toggle drawn as a small plate. */
export function Chip({ pressed, onClick, children }: ChipProps) {
  return (
    <button type="button" className={styles.chip ?? ''} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  )
}
