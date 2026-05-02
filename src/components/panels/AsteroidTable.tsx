import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNeo } from '@/hooks/useNeo'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { DataAge } from '@/components/ui/DataAge'
import { formatKm, formatLunarDistance, formatVelocity, formatDiameter } from '@/lib/format'
import type { NeoObject } from '@/schemas/neo'
import styles from './asteroid-table.module.css'

type SortKey = 'missKm' | 'velocity' | 'diameter' | 'hazardous'
type SortDir = 'asc' | 'desc'

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
  return all
}

function sortNeos(neos: FlatNeo[], key: SortKey, dir: SortDir): FlatNeo[] {
  return [...neos].sort((a, b) => {
    let diff = 0
    if (key === 'missKm') diff = a.missKm - b.missKm
    else if (key === 'velocity') diff = a.velocityKps - b.velocityKps
    else if (key === 'diameter')
      diff = (a.diameterMin + a.diameterMax) / 2 - (b.diameterMin + b.diameterMax) / 2
    else if (key === 'hazardous') diff = (b.isHazardous ? 1 : 0) - (a.isHazardous ? 1 : 0)
    return dir === 'asc' ? diff : -diff
  })
}

interface SortableThProps {
  label: string
  sortKey: SortKey
  current: SortKey
  dir: SortDir
  align?: 'left' | 'right' | 'center'
  onSort: (key: SortKey) => void
}

function SortableTh({ label, sortKey, current, dir, align = 'left', onSort }: SortableThProps) {
  const active = current === sortKey
  const ariaSort = active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'
  const thClass = [
    styles.th ?? '',
    align === 'right' ? (styles.thRight ?? '') : '',
    align === 'center' ? (styles.thCenter ?? '') : '',
    styles.thSortable ?? '',
    active ? (styles.thActive ?? '') : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <th
      scope="col"
      className={thClass}
      aria-sort={ariaSort}
      onClick={() => onSort(sortKey)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSort(sortKey)
        }
      }}
      tabIndex={0}
    >
      {label}
      <span className={styles.sortIcon ?? ''} aria-hidden="true">
        {active ? (dir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
      </span>
    </th>
  )
}

export function AsteroidTable() {
  const { data, isLoading, error } = useNeo()
  const updatedAt = useQueryClient().getQueryState(['neo'])?.dataUpdatedAt ?? 0
  const [sortKey, setSortKey] = useState<SortKey>('missKm')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'hazardous' ? 'desc' : 'asc')
    }
  }

  const renderContent = () => {
    if (isLoading && !data) {
      return <div className={styles.loading ?? ''}>Loading...</div>
    }

    if (error || !data) {
      return <div className={styles.unavailable ?? ''}>Data unavailable</div>
    }

    const raw = flattenNeos(data.near_earth_objects)
    const neos = sortNeos(raw, sortKey, sortDir).slice(0, 12)

    if (neos.length === 0) {
      return <div className={styles.empty ?? ''}>No close approaches in the next 7 days</div>
    }

    return (
      <table className={styles.table ?? ''}>
        <caption className={styles.caption ?? ''}>Near-Earth Objects · Next 7 days</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.th ?? ''}>
              Name
            </th>
            <th scope="col" className={styles.th ?? ''}>
              Date
            </th>
            <SortableTh
              label="Miss Distance"
              sortKey="missKm"
              current={sortKey}
              dir={sortDir}
              align="right"
              onSort={handleSort}
            />
            <SortableTh
              label="Velocity"
              sortKey="velocity"
              current={sortKey}
              dir={sortDir}
              align="right"
              onSort={handleSort}
            />
            <SortableTh
              label="Diameter"
              sortKey="diameter"
              current={sortKey}
              dir={sortDir}
              align="right"
              onSort={handleSort}
            />
            <SortableTh
              label="⚠"
              sortKey="hazardous"
              current={sortKey}
              dir={sortDir}
              align="center"
              onSort={handleSort}
            />
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
    <GlassPanel variant="panel" label="Close Approaches · 7 days" breathe>
      <DataAge updatedAt={updatedAt} />
      <div className={styles.asteroidTable ?? ''}>{renderContent()}</div>
    </GlassPanel>
  )
}
