import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { EpicPanel } from '@/components/panels/EpicPanel'
import styles from './console.module.css'

export function EarthConsole() {
  return (
    <div className={styles.console ?? ''}>
      <div className={styles.intro ?? ''}>
        <span className={styles.introTitle ?? ''}>Earth</span>
        <span className={styles.introSub ?? ''}>
          Hazards &amp; systems — toggle live layers on the globe above
        </span>
      </div>
      <div className={styles.wide ?? ''}>
        <ErrorBoundary label="EPIC">
          <EpicPanel />
        </ErrorBoundary>
      </div>
    </div>
  )
}
