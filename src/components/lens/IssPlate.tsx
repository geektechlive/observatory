import styles from './lens.module.css'

export type MapMode = 'globe' | 'map'

interface IssPlateProps {
  lat: number | undefined
  lon: number | undefined
  altKm: number | undefined
  /** Orbital speed in km/h, as the ISS hook reports it. */
  velKmH: number | undefined
  intervalMs: number
  mapMode: MapMode
  onMapMode: (mode: MapMode) => void
}

const KMH_PER_KMS = 3600

function fmtLat(lat: number): string {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`
}

function fmtLon(lon: number): string {
  return `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`
}

/**
 * The ISS plate under the lens (#63): altitude, speed and ground point, plus the
 * Globe/Map toggle, which stays with the ISS readout so it is always in view.
 */
export function IssPlate({
  lat,
  lon,
  altKm,
  velKmH,
  intervalMs,
  mapMode,
  onMapMode,
}: IssPlateProps) {
  const has = lat !== undefined && lon !== undefined
  return (
    <div className={`${styles.plate ?? ''} ${styles.issPlate ?? ''}`}>
      <span className={styles.engrave ?? ''}>ISS-1 · UNITY</span>
      <span className={styles.readout ?? ''}>
        <span className={styles.signal ?? ''}>{altKm !== undefined ? altKm.toFixed(1) : '—'}</span>
        <span className={styles.unit ?? ''}>km</span>{' '}
        <span className={styles.signal ?? ''}>
          {velKmH !== undefined ? (velKmH / KMH_PER_KMS).toFixed(2) : '—'}
        </span>
        <span className={styles.unit ?? ''}>km/s</span>
      </span>
      <span className={styles.faint ?? ''}>
        {has ? `over ${fmtLat(lat)} ${fmtLon(lon)}` : 'acquiring'}
        {' · '}
        {intervalMs <= 200 ? '5 Hz SGP4' : 'SGP4, reduced motion'}
      </span>
      <div className={styles.mapToggle ?? ''} role="group" aria-label="Map view mode">
        {(['globe', 'map'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={styles.mapToggleBtn ?? ''}
            aria-pressed={mapMode === mode}
            onClick={() => {
              onMapMode(mode)
            }}
          >
            {mode === 'globe' ? 'Globe' : 'Map'}
          </button>
        ))}
      </div>
    </div>
  )
}
