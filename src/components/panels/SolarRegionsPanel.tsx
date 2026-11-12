import { DataAge } from '@/components/ui/DataAge'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Label } from '@/components/ui/Label'
import { PanelState } from '@/components/ui/PanelState'
import { useSolarRegions } from '@/hooks/useSolarRegions'
import { magClassWords } from '@/lib/magClass'
import { panelView } from '@/lib/panelView'
import { regionsOutOfDate } from '@/lib/sunDisc'
import type { ActiveRegion, FlareOdds } from '@/schemas/solarRegions'

import styles from './solar-regions-panel.module.css'

// NOAA SWPC's day-1 flare odds and its numbered active regions (#210). Public domain
// (weather.gov/disclaimer): credited, shown as published, never called official.
const SWPC_REGIONS_URL = 'https://www.spaceweather.gov/products/solar-region-summary'

function utcDay(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

function Odds({ odds }: { odds: FlareOdds }) {
  const rows = [
    { label: 'C class', value: odds.c },
    { label: 'M class', value: odds.m },
    { label: 'X class', value: odds.x },
    { label: 'Proton', value: odds.proton },
  ]
  const day = utcDay(odds.forDate)
  // SWPC stalled: the newest forecast is for a day already past.
  const past = odds.forDate < new Date().toISOString().slice(0, 10)
  return (
    <div className={styles.odds ?? ''}>
      <Label>
        Flare odds · {day} UTC{past ? ' · latest issued' : ''}
      </Label>
      <ul className={styles.oddsList ?? ''} aria-label={`Flare odds for ${day}`}>
        {rows.map((r) => (
          <li key={r.label} className={styles.oddsRow ?? ''}>
            <span className={styles.oddsLabel ?? ''}>{r.label}</span>
            <span className={styles.bar ?? ''} aria-hidden="true">
              <span className={styles.fill ?? ''} style={{ width: `${String(r.value)}%` }} />
            </span>
            <span className={styles.oddsValue ?? ''}>{r.value}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface RegionsData {
  items: ActiveRegion[]
  validAt: string
  observedDate: string
  preliminary: boolean
}

/** A value SWPC hasn't issued yet on an early day (#213). */
function Unissued() {
  return <span title="Not yet issued by SWPC">–</span>
}

function Regions({ items, validAt, observedDate, preliminary }: RegionsData) {
  const outOfDate = regionsOutOfDate(validAt, new Date()) ? (
    <p className={styles.note ?? ''}>
      SWPC has not issued a newer region summary: these are as of {utcDay(validAt.slice(0, 10))}.
    </p>
  ) : preliminary ? (
    <p className={styles.note ?? ''}>
      Early reports for {utcDay(observedDate)}: SWPC issues the magnetic classes and region odds
      with its daily summary at 00:30 UTC.
    </p>
  ) : null
  if (items.length === 0) {
    return (
      <>
        {outOfDate}
        <p className={styles.note ?? ''}>No numbered sunspot regions in SWPC&apos;s summary.</p>
      </>
    )
  }
  return (
    <>
      {outOfDate}
      <RegionTable items={items} validAt={validAt} preliminary={preliminary} />
    </>
  )
}

function RegionTable({
  items,
  validAt,
  preliminary,
}: {
  items: ActiveRegion[]
  validAt: string
  preliminary: boolean
}) {
  return (
    <table className={styles.table ?? ''} aria-label="Active regions">
      <caption className={styles.caption ?? ''}>
        Positions at {utcDay(validAt.slice(0, 10))} 00:00 UTC
        {preliminary ? ', carried forward by SWPC' : ''}
      </caption>
      <thead>
        <tr>
          <th scope="col">Region</th>
          <th scope="col">Location</th>
          <th scope="col" title="Millionths of the visible hemisphere">
            Area
          </th>
          <th scope="col">Spots</th>
          <th scope="col">Magnetic class</th>
          <th scope="col" title="SWPC's odds of an M-class flare from this region">
            M odds
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((r) => (
          <tr key={r.region}>
            <th scope="row">{r.region}</th>
            <td>{r.location}</td>
            <td>{r.area ?? '—'}</td>
            <td>{r.spots ?? '—'}</td>
            <td>{preliminary && r.magClass === null ? <Unissued /> : magClassWords(r.magClass)}</td>
            <td>{r.m !== null ? `${String(r.m)}%` : preliminary ? <Unissued /> : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function SolarRegionsPanel() {
  const query = useSolarRegions()
  const view = panelView(query, 'solar-regions')

  if (view.kind === 'loading') {
    return (
      <GlassPanel variant="tile" label="Active Regions">
        <PanelState kind="loading" />
      </GlassPanel>
    )
  }

  if (view.kind === 'unavailable') {
    return (
      <GlassPanel variant="tile" label="Active Regions">
        <PanelState kind="unavailable" detail="The NOAA SWPC region feed did not answer" />
      </GlassPanel>
    )
  }

  const { data, refreshFailed, age } = view

  return (
    <GlassPanel variant="tile" label="Active Regions">
      {refreshFailed && <DataAge {...age} />}
      <div className={styles.panel ?? ''}>
        {data.probabilities ? (
          <Odds odds={data.probabilities} />
        ) : (
          <p className={styles.note ?? ''}>The flare odds did not load.</p>
        )}
        {data.regions ? (
          <Regions {...data.regions} />
        ) : (
          <p className={styles.note ?? ''}>The region list did not load.</p>
        )}
        <p className={styles.credit ?? ''}>
          Forecast and regions by{' '}
          <a href={SWPC_REGIONS_URL} target="_blank" rel="noreferrer">
            NOAA SWPC
          </a>
          , shown as published. The marks on the disc are SWPC&apos;s 00:00 UTC positions, turned
          with the Sun&apos;s rotation to the time of the image.
        </p>
      </div>
    </GlassPanel>
  )
}
