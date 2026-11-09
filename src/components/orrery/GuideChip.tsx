import styles from './orrery.module.css'

interface GuideChipProps {
  onOpen: () => void
  onDismiss: () => void
}

// OrbitControls' defaults; guide/sections.ts says the same at more length.
const MOUSE_HINT = 'Drag to turn · Scroll to zoom · Right-drag to slide'
const TOUCH_HINT = 'One finger turns · Pinch zooms · Two fingers slide'

/**
 * The first-visit nudge (#159): a small note on the stage, never a modal. It stays until
 * the visitor opens the guide or dismisses it (guideHint.ts remembers either). It also says
 * how to move the view (#185), because sliding it is not something people find by trying.
 */
export function GuideChip({ onOpen, onDismiss }: GuideChipProps) {
  const isTouch = window.matchMedia('(pointer: coarse)').matches
  return (
    <div className={styles.guideChip ?? ''} role="note" data-label-obstacle="">
      <p className={styles.switchHint ?? ''}>{isTouch ? TOUCH_HINT : MOUSE_HINT}</p>
      <div className={styles.guideChipRow ?? ''}>
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
    </div>
  )
}
