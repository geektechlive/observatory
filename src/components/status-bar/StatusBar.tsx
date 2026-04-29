import { useState } from 'react'
import { DualClock } from './DualClock'
import { LiveIndicator } from './LiveIndicator'
import { ApiQuotaMeter } from './ApiQuotaMeter'
import { AboutPopover } from './AboutPopover'
import { useUiStore } from '@/store/ui'
import styles from './status-bar.module.css'

export function StatusBar() {
  const [aboutOpen, setAboutOpen] = useState(false)
  const isLive = useUiStore((s) => s.isLive)

  return (
    <header role="banner">
      <nav className={styles.bar} aria-label="Observatory status">
        <span className={styles.brand}>
          cosmo<span className={styles.brandDot}>.</span>observatory
        </span>

        <span className={styles.divider} aria-hidden="true" />

        <LiveIndicator live={isLive} />

        <span className={styles.spacer} />

        <ApiQuotaMeter />

        <span className={styles.divider} aria-hidden="true" />

        <DualClock />

        <span className={styles.divider} aria-hidden="true" />

        <div className={styles.aboutWrap ?? ''}>
          <button
            type="button"
            className={styles.infoBtn}
            aria-label="About cosmo.observatory"
            aria-expanded={aboutOpen}
            aria-controls="about-popover"
            title="About"
            onClick={() => setAboutOpen((v) => !v)}
          >
            ⓘ
          </button>
          {aboutOpen && <AboutPopover onClose={() => setAboutOpen(false)} />}
        </div>
      </nav>
    </header>
  )
}
