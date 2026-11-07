import { useId } from 'react'

import styles from './orrery.module.css'

/** One of the orrery's on/off switches, with an optional visible explanation. */
export function Switch({
  label,
  hint,
  on,
  onChange,
}: {
  label: string
  /** A visible one-line explanation; phones have no hover, so no tooltip (#122). */
  hint?: string
  on: boolean
  onChange: (on: boolean) => void
}) {
  const hintId = useId()
  return (
    <div className={styles.switchField ?? ''}>
      <div className={styles.switchRow ?? ''}>
        <span>{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={label}
          aria-describedby={hint ? hintId : undefined}
          className={styles.switch ?? ''}
          onClick={() => {
            onChange(!on)
          }}
        />
      </div>
      {hint && (
        <p id={hintId} className={styles.switchHint ?? ''}>
          {hint}
        </p>
      )}
    </div>
  )
}
