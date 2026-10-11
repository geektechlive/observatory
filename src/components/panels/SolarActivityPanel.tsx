import { useQueryClient } from '@tanstack/react-query'

import { DataAge } from '@/components/ui/DataAge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Label } from '@/components/ui/Label'
import { PanelState } from '@/components/ui/PanelState'
import { Readout } from '@/components/ui/Readout'
import { Sparkline } from '@/components/ui/Sparkline'
import { useSolarActivity } from '@/hooks/useSolarActivity'
import { flareStatus, noaaScaleStatus, statusVar } from '@/lib/severity'

import styles from './solar-activity-panel.module.css'

// GOES X-ray flare-class thresholds (long band, W/m²).
const XRAY_THRESHOLDS = [
  { value: 1e-6, color: 'var(--terminal)' }, // C
  { value: 1e-5, color: 'var(--amber)' }, // M
  { value: 1e-4, color: 'var(--mcrn)' }, // X
]

const classColor = (cls: string | null): string => statusVar(flareStatus(cls))
const scaleColor = (n: number): string => statusVar(noaaScaleStatus(n))

const SCALE_ROWS: { key: 'r' | 's' | 'g'; label: string; prefix: string }[] = [
  { key: 'r', label: 'Radio Blackout', prefix: 'R' },
  { key: 's', label: 'Radiation Storm', prefix: 'S' },
  { key: 'g', label: 'Geomagnetic', prefix: 'G' },
]

function colHeader(offset: number): string {
  if (offset === 0) return 'TODAY'
  return `+${offset}`
}

export function SolarActivityPanel() {
  const { data, isLoading, error } = useSolarActivity()
  const updatedAt = useQueryClient().getQueryState(['solar-activity'])?.dataUpdatedAt ?? 0

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="Solar Activity" breathe>
        <PanelState kind="loading" />
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="Solar Activity" breathe>
        <PanelState kind="unavailable" detail="The NOAA GOES X-ray feed did not answer" />
      </GlassPanel>
    )
  }

  const { xray, scales } = data
  const cls = xray.currentClass

  return (
    <GlassPanel variant="tile" label="Solar Activity" breathe>
      <DataAge updatedAt={updatedAt} />
      <div className={styles.panel ?? ''}>
        <div className={styles.xrayRow ?? ''}>
          <div className={styles.xrayReadout ?? ''}>
            <Readout
              value={cls ?? '—'}
              tone={flareStatus(cls) ?? 'default'}
              className={styles.xrayClass ?? ''}
            />
            <Label>GOES X-Ray</Label>
          </div>
          {xray.series.length > 1 && (
            <div className={styles.xraySpark ?? ''}>
              <Sparkline
                values={xray.series}
                mode="line"
                height={44}
                scale="log"
                min={1e-8}
                max={1e-4}
                color={classColor(cls)}
                thresholds={XRAY_THRESHOLDS}
                fill
                ariaLabel="GOES X-ray flux, last 6 hours, log scale"
              />
              <div className={styles.bandLabels ?? ''} aria-hidden="true">
                <span>X</span>
                <span>M</span>
                <span>C</span>
                <span>B</span>
              </div>
            </div>
          )}
        </div>

        {scales.length > 0 && (
          <div
            className={styles.scalesGrid ?? ''}
            role="table"
            aria-label="NOAA space weather scales"
          >
            <div className={styles.scalesHeaderRow ?? ''} role="row">
              <span className={styles.scaleRowLabel ?? ''} role="columnheader" />
              {scales.map((d) => (
                <span key={d.offset} className={styles.scaleColHead ?? ''} role="columnheader">
                  {colHeader(d.offset)}
                </span>
              ))}
            </div>
            {SCALE_ROWS.map((row) => (
              <div key={row.key} className={styles.scaleRow ?? ''} role="row">
                <span className={styles.scaleRowLabel ?? ''} role="rowheader" title={row.label}>
                  {row.prefix}
                </span>
                {scales.map((d) => {
                  const n = d[row.key]
                  return (
                    <span
                      key={d.offset}
                      className={styles.scaleCell ?? ''}
                      role="cell"
                      style={{ color: scaleColor(n), borderColor: scaleColor(n) }}
                    >
                      {row.prefix}
                      {n}
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </GlassPanel>
  )
}
