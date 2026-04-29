import { useFireball } from '@/hooks/useFireball'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { formatKt, formatRelativeTime, formatDateUtc } from '@/lib/format'
import styles from './fireball-list.module.css'

export function FireballList() {
  const { data, isLoading, error } = useFireball()

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="Fireballs">
        <div className={styles.loading ?? ''}>Loading...</div>
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="Fireballs">
        <div className={styles.unavailable ?? ''}>Data unavailable</div>
      </GlassPanel>
    )
  }

  const recent = data.data.slice(0, 8)

  return (
    <GlassPanel variant="tile" label="Fireballs">
      <div className={styles.fireballList ?? ''}>
        <ol className={styles.list ?? ''}>
          {recent.map((fb, idx) => {
            const hasLocation = fb.lat != null && fb.lon != null
            const locationStr = hasLocation
              ? `${fb.lat}° ${fb.latDir ?? ''} · ${fb.lon}° ${fb.lonDir ?? ''}`
              : 'Location unavailable'
            const vel = fb.vel != null ? `${parseFloat(fb.vel).toFixed(1)} km/s` : null

            return (
              <li key={`${fb.date}-${idx}`} className={styles.item ?? ''}>
                <div className={styles.itemTop ?? ''}>
                  <span className={styles.relTime ?? ''}>{formatRelativeTime(fb.date)}</span>
                  <span className={styles.energy ?? ''}>{formatKt(fb.impactE)}</span>
                </div>
                <div className={styles.utcDate ?? ''}>{formatDateUtc(fb.date)}</div>
                <div className={styles.itemBottom ?? ''}>
                  {vel && (
                    <>
                      <span className={styles.velocity ?? ''}>{vel}</span>
                      <span className={styles.dot ?? ''} aria-hidden="true" />
                    </>
                  )}
                  <span className={styles.location ?? ''}>{locationStr}</span>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </GlassPanel>
  )
}
