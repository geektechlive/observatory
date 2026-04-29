import { useEffect, useRef } from 'react'
import styles from './about-popover.module.css'

interface AboutPopoverProps {
  onClose: () => void
}

const DATA_SOURCES = [
  { label: 'EONET', href: 'https://eonet.gsfc.nasa.gov' },
  { label: 'NeoWs (asteroids)', href: 'https://api.nasa.gov' },
  { label: 'JPL Sentry (impact risk)', href: 'https://ssd-api.jpl.nasa.gov/sentry.api' },
  { label: 'JPL Fireball', href: 'https://ssd-api.jpl.nasa.gov/fireball.api' },
  { label: 'DONKI (space weather)', href: 'https://kauai.ccmc.gsfc.nasa.gov/DONKI' },
  { label: 'APOD', href: 'https://apod.nasa.gov' },
  { label: 'CelesTrak (ISS TLE)', href: 'https://celestrak.org' },
]

export function AboutPopover({ onClose }: AboutPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [onClose])

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const focusable = ref.current?.querySelectorAll<HTMLElement>(
      'a[href], button, [tabindex]:not([tabindex="-1"])',
    )
    focusable?.[0]?.focus()

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }

    document.addEventListener('keydown', trap)
    return () => {
      document.removeEventListener('keydown', trap)
      prev?.focus()
    }
  }, [])

  return (
    <div
      ref={ref}
      id="about-popover"
      role="dialog"
      aria-label="About cosmo.observatory"
      className={styles.popover ?? ''}
    >
      <p className={styles.name ?? ''}>
        cosmo<span className={styles.dot ?? ''}>.</span>observatory
      </p>
      <p className={styles.description ?? ''}>
        Real-time NASA data dashboard — live ISS tracking, natural events, asteroids, space weather,
        and more.
      </p>

      <hr className={styles.rule ?? ''} />

      <p className={styles.credit ?? ''}>
        Inspired by{' '}
        <a
          href="https://github.com/irahulstomar/cosmo-tui"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link ?? ''}
        >
          cosmo-tui
        </a>{' '}
        by{' '}
        <a
          href="https://github.com/irahulstomar"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link ?? ''}
        >
          @irahulstomar
        </a>
      </p>

      <hr className={styles.rule ?? ''} />

      <p className={styles.sectionLabel ?? ''}>Data</p>
      <ul className={styles.sourceList ?? ''}>
        {DATA_SOURCES.map((s) => (
          <li key={s.label}>
            <a
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link ?? ''}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>

      <hr className={styles.rule ?? ''} />

      <p className={styles.footer ?? ''}>
        Built by Chris Favero ·{' '}
        <a
          href="https://github.com/geektechlive/observatory"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link ?? ''}
        >
          Source on GitHub
        </a>
      </p>
    </div>
  )
}
