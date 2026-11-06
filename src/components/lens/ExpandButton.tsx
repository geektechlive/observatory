import type { Ref } from 'react'

import styles from '@/components/ui/primitives.module.css'

interface ExpandButtonProps {
  ref?: Ref<HTMLButtonElement> | undefined
  expanded: boolean
  onToggle: () => void
}

/** Fills the screen with the lens and back again (#89). A chip, like Pause rotation. */
export function ExpandButton({ ref, expanded, onToggle }: ExpandButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      className={styles.chip ?? ''}
      aria-pressed={expanded}
      aria-label={expanded ? 'Exit full view' : 'Expand view'}
      onClick={onToggle}
    >
      {expanded ? 'Exit full view' : 'Expand'}
    </button>
  )
}
