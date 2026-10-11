import { GlassPanel } from '@/components/ui/GlassPanel'
import { Label } from '@/components/ui/Label'
import { PanelState } from '@/components/ui/PanelState'
import { StencilLabel } from '@/components/ui/StencilLabel'
import { Swatch } from '@/components/ui/Swatch'
import { useDsn } from '@/hooks/useDsn'
import type { DsnContact, DsnStation } from '@/lib/dsn'
import { ISS_HEX, LANES, STATUS_HEX } from '@/lib/palette'

import styles from './dsn-panel.module.css'

/** Radio band identity: Ka is telemetry cyan, X the orbital lane, S nominal green. */
function bandColor(band: string): string {
  if (band === 'Ka') return ISS_HEX
  if (band === 'X') return LANES.orbital.emit
  if (band === 'S') return STATUS_HEX.nominal
  return LANES.space.emit
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
        <span key={b} className={styles.band ?? ''}>
          <Swatch color={bandColor(b)} />
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
        <StencilLabel>{station.friendlyName}</StencilLabel>
        <Label>
          {contacts.length > 0
            ? `${contacts.length} link${contacts.length > 1 ? 's' : ''}`
            : 'idle'}
        </Label>
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
        <PanelState kind="loading" detail="Acquiring signal" />
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="Deep Space Network">
        <PanelState kind="unavailable" detail="NASA's DSN Now feed did not answer" />
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
