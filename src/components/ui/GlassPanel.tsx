import type { ReactNode } from 'react'
import styles from './GlassPanel.module.css'

type Variant = 'tile' | 'panel' | 'hero'

interface GlassPanelProps {
  variant?: Variant | undefined
  label?: string | undefined
  className?: string | undefined
  children?: ReactNode
}

function variantClass(v: Variant): string {
  if (v === 'tile') return styles.tile ?? ''
  if (v === 'hero') return styles.hero ?? ''
  return styles.panelVariant ?? ''
}

export function GlassPanel({ variant = 'panel', label, className, children }: GlassPanelProps) {
  const cls = [styles.panel ?? '', variantClass(variant), className].filter(Boolean).join(' ')

  return (
    <div className={cls}>
      {label && <span className={styles.label ?? ''}>{label}</span>}
      {children}
    </div>
  )
}
