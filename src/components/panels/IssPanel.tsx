import { useIss } from '@/hooks/useIss'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { StatNumber } from '@/components/ui/StatNumber'
import styles from './iss-panel.module.css'

export function IssPanel() {
  const { position, isLoading, error } = useIss()

  const content = () => {
    if (isLoading && !position) {
      return (
        <div className={styles.shimmer ?? ''}>
          <div className={styles.shimmerRow ?? ''} />
          <div className={styles.shimmerRow ?? ''} />
          <div className={styles.shimmerRow ?? ''} />
        </div>
      )
    }

    if (error || !position) {
      return <div className={styles.unavailable ?? ''}>Telemetry unavailable</div>
    }

    return (
      <div className={styles.statRow ?? ''}>
        <div className={styles.coordRow ?? ''}>
          <StatNumber
            value={position.lat.toFixed(2)}
            unit="° N/S"
            label="Latitude"
            accent="green"
          />
          <StatNumber
            value={position.lon.toFixed(2)}
            unit="° E/W"
            label="Longitude"
            accent="green"
          />
        </div>
        <StatNumber value={position.alt.toFixed(1)} unit="km" label="Altitude" accent="cyan" />
        <StatNumber
          value={Math.round(position.vel).toLocaleString()}
          unit="km/h"
          label="Velocity"
          accent="cyan"
        />
      </div>
    )
  }

  return (
    <GlassPanel variant="tile" label="ISS">
      <div className={styles.issPanel ?? ''}>{content()}</div>
    </GlassPanel>
  )
}
