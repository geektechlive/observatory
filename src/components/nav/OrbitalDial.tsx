import type { ReactNode } from 'react'
import { useUiStore, CONSOLE_VIEWS, type ConsoleView } from '@/store/ui'
import styles from './orbital-dial.module.css'

const META: Record<ConsoleView, { label: string; sub: string; glyph: ReactNode }> = {
  earth: {
    label: 'EARTH',
    sub: 'Hazards · Systems',
    glyph: (
      <g>
        <circle cx="0" cy="0" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M-7 0 H7 M0 -7 V7 M-5 -4 Q0 0 5 -4 M-5 4 Q0 0 5 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.9"
          opacity="0.7"
        />
      </g>
    ),
  },
  sun: {
    label: 'SUN',
    sub: 'Space Weather',
    glyph: (
      <g>
        <circle cx="0" cy="0" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i / 8) * Math.PI * 2
          const x1 = Math.cos(a) * 6.5
          const y1 = Math.sin(a) * 6.5
          const x2 = Math.cos(a) * 9
          const y2 = Math.sin(a) * 9
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.1" />
          )
        })}
      </g>
    ),
  },
  sky: {
    label: 'SKY',
    sub: 'Planets · Deep Space',
    glyph: (
      <g fill="currentColor">
        <path d="M0 -8 L1.6 -1.6 L8 0 L1.6 1.6 L0 8 L-1.6 1.6 L-8 0 L-1.6 -1.6 Z" />
        <circle cx="5.5" cy="-5" r="1" />
        <circle cx="-6" cy="4" r="0.8" />
      </g>
    ),
  },
  orbit: {
    label: 'ORBIT',
    sub: 'Tracking · Launch',
    glyph: (
      <g>
        <circle cx="0" cy="0" r="3" fill="currentColor" />
        <ellipse
          cx="0"
          cy="0"
          rx="9"
          ry="4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          transform="rotate(-25)"
        />
        <circle cx="8.2" cy="-3.8" r="1.6" fill="currentColor" />
      </g>
    ),
  },
}

export function OrbitalDial() {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)

  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = CONSOLE_VIEWS.indexOf(view)
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      setView(CONSOLE_VIEWS[(idx + 1) % CONSOLE_VIEWS.length] as ConsoleView)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      setView(CONSOLE_VIEWS[(idx - 1 + CONSOLE_VIEWS.length) % CONSOLE_VIEWS.length] as ConsoleView)
    }
  }

  return (
    <div
      className={styles.dial ?? ''}
      role="tablist"
      aria-label="Observatory console"
      onKeyDown={onKeyDown}
    >
      <svg
        className={styles.orbitLine ?? ''}
        viewBox="0 0 400 40"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M10 30 Q200 2 390 30"
          fill="none"
          stroke="var(--copper)"
          strokeWidth="0.75"
          opacity="0.4"
          strokeDasharray="2 4"
        />
      </svg>
      {CONSOLE_VIEWS.map((v) => {
        const active = v === view
        const m = META[v]
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className={`${styles.node ?? ''} ${active ? (styles.nodeActive ?? '') : ''}`}
            onClick={() => setView(v)}
          >
            <span className={styles.glyphRing ?? ''} aria-hidden="true">
              <svg viewBox="-12 -12 24 24" className={styles.glyph ?? ''}>
                {m.glyph}
              </svg>
            </span>
            <span className={styles.nodeLabel ?? ''}>{m.label}</span>
            <span className={styles.nodeSub ?? ''}>{m.sub}</span>
          </button>
        )
      })}
    </div>
  )
}
