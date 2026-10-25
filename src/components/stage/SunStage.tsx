import { useState } from 'react'

import { Label } from '@/components/ui/Label'
import { PanelState } from '@/components/ui/PanelState'
import { Readout } from '@/components/ui/Readout'
import { useImageBucket } from '@/hooks/useImageBucket'
import { useSdoTimes } from '@/hooks/useSdoTimes'
import { useSolarActivity } from '@/hooks/useSolarActivity'
import { formatObserved, observedAt } from '@/lib/sdoTimes'
import { flareStatus } from '@/lib/severity'

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

export function SunStage({ size = 460 }: { size?: number }) {
  const [wl, setWl] = useState('0171')
  const bucket = useImageBucket(REFRESH_MS)
  const [errored, setErrored] = useState(false)
  const { data: sa } = useSolarActivity()
  // The zoom crops SDO's burned-in stamp, so the time comes from SDO's times files (#73).
  const { data: sdo } = useSdoTimes()
  const observed = sdo ? observedAt(sdo.times, wl) : null

  const flare = sa?.xray.currentClass ?? null
  const flaring = flare ? flare[0] === 'M' || flare[0] === 'X' : false
  const disc = Math.min(size, 380)
  const src = `https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_${wl}.jpg?t=${bucket}`

  return (
    <div
      className={styles.stage ?? ''}
      style={{ width: '100%', maxWidth: size, aspectRatio: '1 / 1' }}
    >
      <div className={styles.coronaField ?? ''} aria-hidden="true" />
      <div
        className={`${styles.disc ?? ''} ${flaring ? (styles.flaring ?? '') : ''}`}
        style={{ width: `${String((disc / size) * 100)}%`, aspectRatio: '1 / 1' }}
      >
        {errored ? (
          <div className={styles.unavailable ?? ''}>
            <PanelState kind="unavailable" detail="SDO imagery did not load" />
          </div>
        ) : (
          <img
            key={wl}
            src={src}
            alt={`Sun at ${wl}`}
            className={styles.discImg ?? ''}
            decoding="async"
            onError={() => {
              setErrored(true)
            }}
            onLoad={() => {
              setErrored(false)
            }}
          />
        )}
        <div className={styles.limb ?? ''} aria-hidden="true" />
        {flaring && <div className={styles.flarePulse ?? ''} aria-hidden="true" />}
      </div>

      <div className={styles.readout ?? ''}>
        <Readout
          value={flare ?? '—'}
          tone={flareStatus(flare) ?? undefined}
          className={styles.readoutClass ?? ''}
        />
        <Label>GOES X-ray · SDO/AIA</Label>
      </div>

      <div className={styles.foot ?? ''}>
        {observed && (
          <span className={styles.observed ?? ''}>
            Observed <time dateTime={observed}>{formatObserved(observed)}</time>
          </span>
        )}
        <div className={styles.waves ?? ''} role="group" aria-label="Wavelength">
          {WAVELENGTHS.map((w) => (
            <button
              key={w.key}
              type="button"
              aria-pressed={w.key === wl}
              className={styles.wave ?? ''}
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
    </div>
  )
}
