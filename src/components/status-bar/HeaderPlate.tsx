import { useState } from 'react'

import { deriveLiveStatus, HEADLINE_SOURCES } from '@/lib/health'
import { useUiStore } from '@/store/ui'

import { AboutPopover } from './AboutPopover'
import { ApiQuotaMeter } from './ApiQuotaMeter'
import { DualClock } from './DualClock'
import styles from './header-plate.module.css'
import { LiveIndicator } from './LiveIndicator'

/**
 * The page header (#63): one riveted hull plate, as in the approved prototype. The ship
 * name is a painted mark (Special Elite), the subtitle says what the page is, and the
 * right side carries the clocks, feed health, the NASA quota and About.
 */
export function HeaderPlate() {
  const [aboutOpen, setAboutOpen] = useState(false)
  // LIVE means every headline source returned data that passed its content contract.
  const sourceHealth = useUiStore((s) => s.sourceHealth)
  const liveStatus = deriveLiveStatus(sourceHealth)
  const healthy = HEADLINE_SOURCES.filter((name) => sourceHealth[name] === 'ok').length

  return (
    <header role="banner" className={styles.header ?? ''}>
      <div className={styles.ship ?? ''}>
        <h1 className={styles.name ?? ''}>Observatory</h1>
        <p className={styles.subtitle ?? ''}>Earth watch, live NASA and NOAA feeds</p>
      </div>
      <div className={styles.right ?? ''}>
        <DualClock />
        <div className={styles.status ?? ''}>
          <LiveIndicator status={liveStatus} feeds={healthy} />
          <ApiQuotaMeter />
          <div className={styles.aboutWrap ?? ''}>
            <button
              type="button"
              className={styles.infoBtn ?? ''}
              aria-label="About observatory"
              aria-expanded={aboutOpen}
              aria-controls="about-popover"
              title="About"
              onClick={() => {
                setAboutOpen((v) => !v)
              }}
            >
              ⓘ
            </button>
            {aboutOpen && (
              <AboutPopover
                onClose={() => {
                  setAboutOpen(false)
                }}
              />
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
