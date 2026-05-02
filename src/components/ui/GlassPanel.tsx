import type { ReactNode } from 'react'
import styles from './GlassPanel.module.css'

type Variant = 'tile' | 'panel' | 'hero'
type Tone = 'copper' | 'mcrn' | 'signal'
type Depth = 'near' | 'mid' | 'far'

interface GlassPanelProps {
  variant?: Variant | undefined
  tone?: Tone | undefined
  depth?: Depth | undefined
  breathe?: boolean | undefined
  label?: string | undefined
  className?: string | undefined
  children?: ReactNode
}

function variantClass(v: Variant): string {
  if (v === 'tile') return styles.tile ?? ''
  if (v === 'hero') return styles.hero ?? ''
  return styles.panelVariant ?? ''
}

function toneClass(t: Tone): string {
  if (t === 'mcrn') return styles.toneMcrn ?? ''
  if (t === 'signal') return styles.toneSignal ?? ''
  return ''
}

function depthClass(d: Depth): string {
  if (d === 'mid') return styles.depthMid ?? ''
  if (d === 'far') return styles.depthFar ?? ''
  return ''
}

export function GlassPanel({
  variant = 'panel',
  tone = 'copper',
  depth = 'near',
  breathe,
  label,
  className,
  children,
}: GlassPanelProps) {
  const cls = [
    styles.panel ?? '',
    variantClass(variant),
    toneClass(tone),
    depthClass(depth),
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls} data-breathe={breathe ? 'true' : undefined}>
      {label && <span className={styles.label ?? ''}>{label}</span>}
      {children}
    </div>
  )
}
