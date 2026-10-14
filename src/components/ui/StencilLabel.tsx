import type { ReactNode } from 'react'

import styles from './primitives.module.css'

/** Engraved caps. Only on hull plates (spec rule 8), never as an eyebrow over prose. */
export function StencilLabel({ children }: { children: ReactNode }) {
  return <span className={styles.stencil ?? ''}>{children}</span>
}
