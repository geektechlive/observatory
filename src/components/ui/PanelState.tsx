import styles from './primitives.module.css'

type Kind = 'loading' | 'unavailable' | 'empty'

const TITLE: Record<Kind, string> = {
  loading: 'Loading',
  unavailable: 'Data unavailable',
  empty: 'Nothing to show',
}

interface PanelStateProps {
  kind: Kind
  /** What is missing and why, in plain words. Empty states pass their message here. */
  detail?: string | undefined
}

/** One loading / unavailable / empty recipe, announced politely to screen readers. */
export function PanelState({ kind, detail }: PanelStateProps) {
  return (
    <div className={styles.state ?? ''} data-kind={kind} role="status" aria-live="polite">
      {kind !== 'empty' && <span className={styles.stateTitle ?? ''}>{TITLE[kind]}</span>}
      {detail && <span className={styles.stateDetail ?? ''}>{detail}</span>}
    </div>
  )
}
