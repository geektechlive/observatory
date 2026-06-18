import { useDsn } from '@/hooks/useDsn'
import { GlassPanel } from '@/components/ui/GlassPanel'
import type { DsnContact, DsnStation } from '@/lib/dsn'
import styles from './dsn-panel.module.css'

function bandColor(band: string): string {
  if (band === 'Ka') return 'var(--signal)'
  if (band === 'X') return 'var(--amber)'
  if (band === 'S') return 'var(--terminal)'
  return 'var(--copper-glow)'
}

/** Format one-way light time (rtlt/2, seconds) compactly. */
function lightTime(rtlt: number): string | null {
  if (!isFinite(rtlt) || rtlt <= 0) return null
  const s = rtlt / 2
  if (s < 90) return `${Math.round(s)}s lt`
  const m = s / 60
  if (m < 90) return `${m.toFixed(1)}m lt`
  const h = Math.floor(m / 60)
  return `${h}h ${Math.round(m - h * 60)}m lt`
}

function ContactRow({ c }: { c: DsnContact }) {
  const lt = lightTime(c.rtlt)
  return (
    <li className={styles.contact ?? ''}>
      <span className={styles.craft ?? ''}>{c.spacecraft}</span>
      <span className={styles.dirs ?? ''} aria-hidden="true">
        {c.hasUp && <span className={styles.up ?? ''}>▲</span>}
        {c.hasDown && <span className={styles.down ?? ''}>▼</span>}
      </span>
      {c.bands.map((b) => (
        <span key={b} className={styles.band ?? ''} style={{ color: bandColor(b) }}>
          {b}
        </span>
      ))}
      {lt && <span className={styles.lt ?? ''}>{lt}</span>}
    </li>
  )
}

function StationBlock({ station }: { station: DsnStation }) {
  const contacts = station.dishes.flatMap((d) => d.contacts)
  return (
    <div className={styles.station ?? ''}>
      <div className={styles.stationHead ?? ''}>
        <span className={styles.stationName ?? ''}>{station.friendlyName}</span>
        <span className={styles.stationCount ?? ''}>
          {contacts.length > 0
            ? `${contacts.length} link${contacts.length > 1 ? 's' : ''}`
            : 'idle'}
        </span>
      </div>
      {contacts.length > 0 && (
        <ul className={styles.contactList ?? ''}>
          {contacts.map((c, i) => (
            <ContactRow key={`${c.spacecraft}-${i}`} c={c} />
          ))}
        </ul>
      )}
    </div>
  )
}

export function DsnPanel() {
  const { data, isLoading, error } = useDsn()

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="Deep Space Network">
        <div className={styles.loading ?? ''}>Acquiring signal...</div>
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="Deep Space Network">
        <div className={styles.unavailable ?? ''}>Data unavailable</div>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel variant="tile" label="Deep Space Network">
      <div className={styles.panel ?? ''}>
        {data.stations.map((s) => (
          <StationBlock key={s.name} station={s} />
        ))}
      </div>
    </GlassPanel>
  )
}
