import { useEffect, useState } from 'react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import styles from './sun-imagery-panel.module.css'

interface SunView {
  key: string
  label: string
  sub: string
  url: string
}

// SDO updates ~every 10-12 min; SOHO LASCO ~every 20-30 min. Direct images
// (CSP img-src allows these domains). No hotlink protection on either.
const VIEWS: SunView[] = [
  {
    key: 'aia0171',
    label: 'Corona',
    sub: 'SDO AIA 171Å',
    url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0171.jpg',
  },
  {
    key: 'aia0193',
    label: 'Hot Corona',
    sub: 'SDO AIA 193Å',
    url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0193.jpg',
  },
  {
    key: 'hmib',
    label: 'Magnetogram',
    sub: 'SDO HMI',
    url: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_HMIB.jpg',
  },
  {
    key: 'c2',
    label: 'CME Watch C2',
    sub: 'SOHO LASCO',
    url: 'https://soho.nascom.nasa.gov/data/realtime/c2/1024/latest.jpg',
  },
  {
    key: 'c3',
    label: 'CME Watch C3',
    sub: 'SOHO LASCO',
    url: 'https://soho.nascom.nasa.gov/data/realtime/c3/1024/latest.jpg',
  },
]

const REFRESH_MS = 10 * 60 * 1000

export function SunImageryPanel() {
  const [active, setActive] = useState(0)
  const [bucket, setBucket] = useState(() => Math.floor(Date.now() / REFRESH_MS))
  const [errored, setErrored] = useState(false)

  // Bump a 10-min cache-busting bucket so the latest frame is pulled.
  useEffect(() => {
    const id = setInterval(() => setBucket(Math.floor(Date.now() / REFRESH_MS)), 60_000)
    return () => clearInterval(id)
  }, [])

  const view = VIEWS[active] ?? VIEWS[0]
  if (!view) return null
  const src = `${view.url}?t=${bucket}`

  return (
    <GlassPanel variant="tile" label="Live Sun">
      <div className={styles.panel ?? ''}>
        <div className={styles.imageWrap ?? ''}>
          {errored ? (
            <div className={styles.unavailable ?? ''}>Imagery unavailable</div>
          ) : (
            <img
              key={view.key}
              src={src}
              alt={`${view.label} — ${view.sub}`}
              className={styles.image ?? ''}
              loading="lazy"
              decoding="async"
              onError={() => setErrored(true)}
              onLoad={() => setErrored(false)}
            />
          )}
          <div className={styles.caption ?? ''}>
            <span className={styles.capLabel ?? ''}>{view.label}</span>
            <span className={styles.capSub ?? ''}>{view.sub}</span>
          </div>
        </div>
        <div className={styles.tabs ?? ''} role="tablist" aria-label="Solar imagery view">
          {VIEWS.map((v, i) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={i === active}
              className={`${styles.tab ?? ''} ${i === active ? (styles.tabActive ?? '') : ''}`}
              onClick={() => {
                setActive(i)
                setErrored(false)
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </GlassPanel>
  )
}
