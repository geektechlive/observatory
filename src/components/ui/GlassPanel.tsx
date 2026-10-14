import type { ReactNode } from 'react'

import styles from './GlassPanel.module.css'

type Variant = 'tile' | 'panel' | 'hero'
type Tone = 'copper' | 'mcrn' | 'signal'
type Depth = 'near' | 'mid' | 'far'
type HeadingLevel = 2 | 3 | 4

interface GlassPanelProps {
  variant?: Variant | undefined
  tone?: Tone | undefined
  depth?: Depth | undefined
  breathe?: boolean | undefined
  label?: string | undefined
  /** The label is the panel's heading; nested panels pass 3 or 4. */
  headingLevel?: HeadingLevel | undefined
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
  headingLevel = 2,
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
  const Heading = `h${String(headingLevel)}` as 'h2' | 'h3' | 'h4'

  return (
    <div className={cls} data-breathe={breathe ? 'true' : undefined}>
      {label && <Heading className={styles.label ?? ''}>{label}</Heading>}
      {children}
    </div>
  )
}
