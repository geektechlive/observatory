import { useState } from 'react'

import { deriveLiveStatus } from '@/lib/health'
import { useUiStore } from '@/store/ui'

import { AboutPopover } from './AboutPopover'
import { ApiQuotaMeter } from './ApiQuotaMeter'
import styles from './belter-header.module.css'
import { DualClock } from './DualClock'
import { LiveIndicator } from './LiveIndicator'

const RIVET_COUNT = 26

export function BelterHeader() {
  const [aboutOpen, setAboutOpen] = useState(false)
  // LIVE now means every headline source returned data that passed its content
  // contract. Before this, an empty-but-HTTP-200 payload still read as LIVE, which
  // is how five dead feeds went unnoticed. SYNCING covers the pre-settle window.
  const sourceHealth = useUiStore((s) => s.sourceHealth)
  const liveStatus = deriveLiveStatus(sourceHealth)

  return (
    <header role="banner" className={styles.header ?? ''}>
      {/* Ghost stencil number — decorative, position:absolute */}
      <div className={styles.ghostNumber ?? ''} aria-hidden="true">
        04
      </div>

      {/* Welded patch — decorative */}
      <svg className={styles.weldPatch ?? ''} width="160" height="36" aria-hidden="true">
        <path
          d="M 0 18 Q 40 10 80 18 T 160 18"
          fill="none"
          stroke="oklch(0.55 0.13 45)"
          strokeWidth="1.2"
          strokeDasharray="4 3"
        />
        <path
          d="M 0 22 Q 40 14 80 22 T 160 22"
          fill="none"
          stroke="oklch(0.42 0.10 45)"
          strokeWidth="0.8"
          strokeDasharray="3 4"
        />
      </svg>

      <div className={styles.inner ?? ''}>
        {/* Left: compact identifier + subtitle */}
        <div className={styles.left ?? ''}>
          <div className={styles.identifier ?? ''}>
            <span className={styles.sysId ?? ''}>OBS-04</span>
            <h1 className={styles.title ?? ''}>OBSERVATORY</h1>
          </div>
          <div className={styles.subtitle ?? ''}>
            ◇ TYCHO STATION · BELTALOWDA WATCH-DECK · NIGHT-WATCH 04 ◇
          </div>
        </div>

        {/* Right: clock + status controls */}
        <div className={styles.right ?? ''}>
          <DualClock />
          <div className={styles.utilRow ?? ''}>
            <LiveIndicator status={liveStatus} />
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
      </div>

      {/* Riveted bottom seam */}
      <div className={styles.rivets ?? ''} aria-hidden="true">
        {Array.from({ length: RIVET_COUNT }, (_, i) => (
          <span key={i} className={styles.rivet ?? ''} />
        ))}
      </div>
    </header>
  )
}
