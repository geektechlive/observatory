import styles from './orrery.module.css'

interface GuideChipProps {
  onOpen: () => void
  onDismiss: () => void
}

/**
 * The first-visit nudge (#159): a small note on the stage, never a modal. It stays until
 * the visitor opens the guide or dismisses it (guideHint.ts remembers either).
 */
export function GuideChip({ onOpen, onDismiss }: GuideChipProps) {
  return (
    <div className={styles.guideChip ?? ''} role="note" data-label-obstacle="">
      <span className={styles.guideChipText ?? ''}>New here?</span>
      <button type="button" className={styles.chipBtn ?? ''} onClick={onOpen}>
        Open the guide
      </button>
      <button
        type="button"
        className={styles.chipBtn ?? ''}
        aria-label="Dismiss the guide hint"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  )
}
