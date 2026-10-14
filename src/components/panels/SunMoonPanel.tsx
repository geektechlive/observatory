import { useQueryClient } from '@tanstack/react-query'

import { DataAge } from '@/components/ui/DataAge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Label } from '@/components/ui/Label'
import { PanelState } from '@/components/ui/PanelState'
import { Readout } from '@/components/ui/Readout'
import { StencilLabel } from '@/components/ui/StencilLabel'
import { useSunMoon } from '@/hooks/useSunMoon'
import { isWaxing, moonLitPath } from '@/lib/moon'
import { MOON_DISC_HEX } from '@/lib/palette'

import styles from './sun-moon-panel.module.css'

const MOON_R = 34

function MoonDisc({ phase, illum }: { phase: string; illum: number }) {
  const waxing = isWaxing(phase)
  const lit = moonLitPath(MOON_R, illum / 100, waxing)
  return (
    <svg
      className={styles.moonSvg ?? ''}
      viewBox={`${-MOON_R - 2} ${-MOON_R - 2} ${(MOON_R + 2) * 2} ${(MOON_R + 2) * 2}`}
      role="img"
      aria-label={`${phase}, ${illum}% illuminated`}
    >
      <circle r={MOON_R} fill={MOON_DISC_HEX.dark} stroke="var(--plate-edge)" strokeWidth={0.5} />
      <path d={lit} fill={MOON_DISC_HEX.lit} opacity={0.92} />
      <circle r={MOON_R} fill="none" stroke="var(--plate-edge)" strokeWidth={0.6} />
    </svg>
  )
}

function daysUntil(dateStr: string): number | null {
  const target = new Date(`${dateStr}T00:00:00`)
  if (isNaN(target.getTime())) return null
  const now = new Date()
  const diff = target.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diff / 86400000))
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className={styles.row ?? ''}>
      <Label>{label}</Label>
      <Readout value={value ?? '—'} className={styles.rowValue ?? ''} />
    </div>
  )
}

export function SunMoonPanel() {
  const { data, isLoading, error, isFallbackLocation, geoStatus, requestLocation } = useSunMoon()
  const updatedAt = useQueryClient().getQueryState(['sun-moon'])?.dataUpdatedAt ?? 0

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="Sun & Moon" breathe>
        <PanelState kind="loading" />
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="Sun & Moon" breathe>
        <PanelState kind="unavailable" detail="The USNO rise and set service is not answering" />
      </GlassPanel>
    )
  }

  const next = data.closestPhase
  const days = next ? daysUntil(next.date) : null

  return (
    <GlassPanel variant="tile" label="Sun & Moon" breathe>
      <DataAge updatedAt={updatedAt} />
      <div className={styles.panel ?? ''}>
        <div className={styles.moonRow ?? ''}>
          <MoonDisc phase={data.curPhase} illum={data.fracIllum} />
          <div className={styles.moonMeta ?? ''}>
            <span className={styles.phaseName ?? ''}>{data.curPhase}</span>
            <span className={styles.illum ?? ''}>{data.fracIllum}% illuminated</span>
            {next && (
              <span className={styles.nextPhase ?? ''}>
                {next.phase}
                {days !== null && (
                  <span className={styles.nextDays ?? ''}>
                    {' '}
                    · {days === 0 ? 'today' : `${days}d`}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        <div className={styles.times ?? ''}>
          <div className={styles.timesCol ?? ''}>
            <StencilLabel>☉ Sun</StencilLabel>
            <Row label="Rise" value={data.sun.rise} />
            <Row label="Set" value={data.sun.set} />
            <Row label="Civil" value={data.sun.civilBegin} />
          </div>
          <div className={styles.timesCol ?? ''}>
            <StencilLabel>☾ Moon</StencilLabel>
            <Row label="Rise" value={data.moon.rise} />
            <Row label="Set" value={data.moon.set} />
            <Row label="Phase" value={`${data.fracIllum}%`} />
          </div>
        </div>

        {geoStatus !== 'granted' && geoStatus !== 'unsupported' && (
          <button
            type="button"
            className={styles.locateBtn ?? ''}
            onClick={requestLocation}
            disabled={geoStatus === 'requesting'}
          >
            {geoStatus === 'requesting' ? 'Locating…' : 'Use my location'}
          </button>
        )}
        {geoStatus === 'denied' && <Label>Location denied — showing Greenwich</Label>}

        <div className={styles.footer ?? ''}>
          <Label>
            {isFallbackLocation
              ? 'Greenwich (location off)'
              : `${data.lat.toFixed(1)}°, ${data.lon.toFixed(1)}° · local`}
          </Label>
        </div>
      </div>
    </GlassPanel>
  )
}
