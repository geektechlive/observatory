import type { CSSProperties } from 'react'

import type { Status } from '@/lib/severity'

import styles from './primitives.module.css'

export type ReadoutTone = Status | 'signal' | 'default'

interface ReadoutProps {
  value: string
  unit?: string | undefined
  tone?: ReadoutTone | undefined
  className?: string | undefined
  style?: CSSProperties | undefined
}

/** A live number: tabular figures, slashed zero, unit set smaller and dimmer. */
export function Readout({ value, unit, tone = 'default', className, style }: ReadoutProps) {
  return (
    <span className={`${styles.readout ?? ''} ${className ?? ''}`} data-tone={tone} style={style}>
      {value}
      {unit && <span className={styles.unit ?? ''}>{unit}</span>}
    </span>
  )
}
