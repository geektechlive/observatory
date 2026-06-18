import { useQueryClient } from '@tanstack/react-query'
import { usePeopleInSpace } from '@/hooks/usePeopleInSpace'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { DataAge } from '@/components/ui/DataAge'
import type { Astronaut } from '@/schemas/peopleInSpace'
import styles from './people-in-space-panel.module.css'

function daysInSpace(launched: number | null): number | null {
  if (launched === null) return null
  const days = Math.floor((Date.now() - launched * 1000) / 86_400_000)
  return days >= 0 ? days : null
}

function groupByCraft(people: Astronaut[]): [string, Astronaut[]][] {
  const map = new Map<string, Astronaut[]>()
  for (const p of people) {
    const list = map.get(p.craft) ?? []
    list.push(p)
    map.set(p.craft, list)
  }
  return [...map.entries()]
}

export function PeopleInSpacePanel() {
  const { data, isLoading, error } = usePeopleInSpace()
  const updatedAt = useQueryClient().getQueryState(['people-in-space'])?.dataUpdatedAt ?? 0

  if (isLoading && !data) {
    return (
      <GlassPanel variant="tile" label="Humans in Orbit">
        <div className={styles.loading ?? ''}>Loading...</div>
      </GlassPanel>
    )
  }

  if (error || !data) {
    return (
      <GlassPanel variant="tile" label="Humans in Orbit">
        <div className={styles.unavailable ?? ''}>Data unavailable</div>
      </GlassPanel>
    )
  }

  const groups = groupByCraft(data.people)

  return (
    <GlassPanel variant="tile" label="Humans in Orbit">
      <DataAge updatedAt={updatedAt} />
      <div className={styles.panel ?? ''}>
        <div className={styles.headline ?? ''}>
          <span className={styles.count ?? ''}>{data.number}</span>
          <span className={styles.countLabel ?? ''}>
            people in space
            {data.expedition && <span className={styles.exp ?? ''}> · Exp {data.expedition}</span>}
          </span>
        </div>

        <div className={styles.groups ?? ''}>
          {groups.map(([craft, crew]) => (
            <div key={craft} className={styles.group ?? ''}>
              <div className={styles.craftHead ?? ''}>
                <span className={styles.craftName ?? ''}>{craft}</span>
                <span className={styles.craftCount ?? ''}>{crew.length}</span>
              </div>
              <ul className={styles.crewList ?? ''}>
                {crew.map((p) => {
                  const days = daysInSpace(p.launched)
                  return (
                    <li key={p.name} className={styles.crew ?? ''}>
                      <span className={styles.crewName ?? ''}>{p.name}</span>
                      <span className={styles.crewMeta ?? ''}>
                        {p.flagCode ? p.flagCode.toUpperCase() : p.country}
                        {days !== null && <span className={styles.crewDays ?? ''}> · {days}d</span>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </GlassPanel>
  )
}
