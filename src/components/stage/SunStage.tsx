import { useEffect, useState } from 'react'
import { useSolarActivity } from '@/hooks/useSolarActivity'
import styles from './sun-stage.module.css'

interface Wavelength {
  key: string
  label: string
}

const WAVELENGTHS: Wavelength[] = [
  { key: '0171', label: '171Å' },
  { key: '0193', label: '193Å' },
  { key: '0304', label: '304Å' },
  { key: 'HMIB', label: 'Magnetogram' },
  { key: '211193171', label: 'Composite' },
]

const REFRESH_MS = 10 * 60 * 1000

function flareColor(cls: string | null): string {
  if (!cls) return 'var(--ink-dim)'
  const c = cls[0]
  if (c === 'X') return 'var(--magenta)'
  if (c === 'M') return 'var(--amber)'
  if (c === 'C') return 'var(--terminal)'
  return 'var(--cyan)'
}

export function SunStage({ size = 460 }: { size?: number }) {
  const [wl, setWl] = useState('0171')
  const [bucket, setBucket] = useState(() => Math.floor(Date.now() / REFRESH_MS))
  const [errored, setErrored] = useState(false)
  const { data: sa } = useSolarActivity()

  useEffect(() => {
    const id = setInterval(() => setBucket(Math.floor(Date.now() / REFRESH_MS)), 60_000)
    return () => clearInterval(id)
  }, [])

  const flare = sa?.xray.currentClass ?? null
  const flaring = flare ? flare[0] === 'M' || flare[0] === 'X' : false
  const disc = Math.min(size, 380)
  const src = `https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_${wl}.jpg?t=${bucket}`

  return (
    <div className={styles.stage ?? ''} style={{ width: size, height: size }}>
      <div className={styles.coronaField ?? ''} aria-hidden="true" />
      <div
        className={`${styles.disc ?? ''} ${flaring ? (styles.flaring ?? '') : ''}`}
        style={{ width: disc, height: disc }}
      >
        {errored ? (
          <div className={styles.unavailable ?? ''}>Solar imagery unavailable</div>
        ) : (
          <img
            key={wl}
            src={src}
            alt={`Sun at ${wl}`}
            className={styles.discImg ?? ''}
            decoding="async"
            onError={() => setErrored(true)}
            onLoad={() => setErrored(false)}
          />
        )}
        <div className={styles.limb ?? ''} aria-hidden="true" />
        {flaring && <div className={styles.flarePulse ?? ''} aria-hidden="true" />}
      </div>

      <div className={styles.readout ?? ''}>
        <span className={styles.readoutClass ?? ''} style={{ color: flareColor(flare) }}>
          {flare ?? '—'}
        </span>
        <span className={styles.readoutLabel ?? ''}>GOES X-RAY · SDO/AIA</span>
      </div>

      <div className={styles.waves ?? ''} role="tablist" aria-label="Wavelength">
        {WAVELENGTHS.map((w) => (
          <button
            key={w.key}
            type="button"
            role="tab"
            aria-selected={w.key === wl}
            className={`${styles.wave ?? ''} ${w.key === wl ? (styles.waveActive ?? '') : ''}`}
            onClick={() => {
              setWl(w.key)
              setErrored(false)
            }}
          >
            {w.label}
          </button>
        ))}
      </div>
    </div>
  )
}
