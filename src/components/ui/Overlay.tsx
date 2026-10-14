import type { ReactNode } from 'react'

import styles from './primitives.module.css'

interface OverlayProps {
  kind: 'tooltip' | 'popover'
  /** Position in px within the nearest positioned ancestor. */
  x?: number | undefined
  y?: number | undefined
  id?: string | undefined
  children: ReactNode
}

/** Floating readout on the shared scrim. Tooltips ignore the pointer; popovers take it. */
export function Overlay({ kind, x, y, id, children }: OverlayProps) {
  return (
    <div
      id={id}
      className={styles.overlay ?? ''}
      data-kind={kind}
      role={kind === 'tooltip' ? 'tooltip' : 'dialog'}
      style={x === undefined || y === undefined ? undefined : { left: x, top: y }}
    >
      {children}
    </div>
  )
}
