import { useNeo } from '@/hooks/useNeo'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { formatKm, formatLunarDistance, formatVelocity, formatDiameter } from '@/lib/format'
import type { NeoObject } from '@/schemas/neo'
import styles from './asteroid-table.module.css'

interface FlatNeo {
  id: string
  name: string
  isHazardous: boolean
  date: string
  missKm: number
  missLd: number
  velocityKps: number
  diameterMin: number
  diameterMax: number
}

function flattenNeos(record: Record<string, NeoObject[]>): FlatNeo[] {
  const all: FlatNeo[] = []
  for (const dateNeos of Object.values(record)) {
    for (const neo of dateNeos) {
      const approach = neo.close_approach_data[0]
      if (!approach) continue
      all.push({
        id: neo.id,
        name: neo.name,
        isHazardous: neo.is_potentially_hazardous_asteroid,
        date: approach.close_approach_date,
        missKm: parseFloat(approach.miss_distance.kilometers) || Infinity,
        missLd: parseFloat(approach.miss_distance.lunar) || Infinity,
        velocityKps: parseFloat(approach.relative_velocity.kilometers_per_second) || 0,
        diameterMin: neo.estimated_diameter.kilometers.estimated_diameter_min,
        diameterMax: neo.estimated_diameter.kilometers.estimated_diameter_max,
      })
    }
  }
  return all.sort((a, b) => a.missKm - b.missKm).slice(0, 12)
}

export function AsteroidTable() {
  const { data, isLoading, error } = useNeo()

  const renderContent = () => {
    if (isLoading && !data) {
      return <div className={styles.loading ?? ''}>Loading...</div>
    }

    if (error || !data) {
      return <div className={styles.unavailable ?? ''}>Data unavailable</div>
    }

    const neos = flattenNeos(data.near_earth_objects)

    if (neos.length === 0) {
      return <div className={styles.empty ?? ''}>No close approaches in the next 7 days</div>
    }

    return (
      <table className={styles.table ?? ''}>
        <caption className={styles.caption ?? ''}>
          Near-Earth Objects · Next 7 days · Closest first
        </caption>
        <thead>
          <tr>
            <th scope="col" className={styles.th ?? ''}>
              Name
            </th>
            <th scope="col" className={styles.th ?? ''}>
              Date
            </th>
            <th scope="col" className={`${styles.th ?? ''} ${styles.thRight ?? ''}`}>
              Miss Distance
            </th>
            <th scope="col" className={`${styles.th ?? ''} ${styles.thRight ?? ''}`}>
              Velocity
            </th>
            <th scope="col" className={`${styles.th ?? ''} ${styles.thRight ?? ''}`}>
              Diameter
            </th>
            <th scope="col" className={`${styles.th ?? ''} ${styles.thCenter ?? ''}`}>
              ⚠
            </th>
          </tr>
        </thead>
        <tbody>
          {neos.map((neo) => (
            <tr key={neo.id}>
              <td
                className={`${styles.td ?? ''} ${neo.isHazardous ? (styles.nameHazard ?? '') : (styles.nameNormal ?? '')}`}
              >
                {neo.name.replace(/[()]/g, '')}
              </td>
              <td className={styles.td ?? ''}>{neo.date}</td>
              <td className={`${styles.td ?? ''} ${styles.tdRight ?? ''} ${styles.missKm ?? ''}`}>
                {formatKm(neo.missKm)}
                <span className={styles.missLd ?? ''}>{formatLunarDistance(neo.missLd)}</span>
              </td>
              <td className={`${styles.td ?? ''} ${styles.tdRight ?? ''}`}>
                {formatVelocity(neo.velocityKps)}
              </td>
              <td className={`${styles.td ?? ''} ${styles.tdRight ?? ''}`}>
                {formatDiameter(neo.diameterMin, neo.diameterMax)}
              </td>
              <td className={`${styles.td ?? ''} ${styles.tdCenter ?? ''}`}>
                {neo.isHazardous && (
                  <span className={styles.hazardIcon ?? ''} aria-label="Potentially hazardous">
                    ⚠
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <GlassPanel variant="panel" label="Close Approaches · 7 days">
      <div className={styles.asteroidTable ?? ''}>{renderContent()}</div>
    </GlassPanel>
  )
}
