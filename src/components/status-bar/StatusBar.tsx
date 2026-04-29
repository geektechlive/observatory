import { DualClock } from './DualClock'
import { LiveIndicator } from './LiveIndicator'
import styles from './status-bar.module.css'

export function StatusBar() {
  return (
    <header role="banner">
      <nav className={styles.bar} aria-label="Observatory status">
        <span className={styles.brand}>
          cosmo<span className={styles.brandDot}>.</span>observatory
        </span>

        <span className={styles.divider} aria-hidden="true" />

        <LiveIndicator live={true} />

        <span className={styles.spacer} />

        <DualClock />

        <span className={styles.divider} aria-hidden="true" />

        <button
          type="button"
          className={styles.infoBtn}
          aria-label="About cosmo.observatory"
          title="About"
        >
          ⓘ
        </button>
      </nav>
    </header>
  )
}
