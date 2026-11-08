import { useDeferredValue, useId, useMemo, useState } from 'react'

import type { SatFieldInfo } from '@/lib/orbit/bulk/satHandler'
import {
  ORBIT_GEO,
  ORBIT_HEO,
  ORBIT_LEO,
  ORBIT_MEO,
  type OrbitClassCode,
} from '@/lib/orbit/orbitClass'
import { SAT_GROUPS, type SatGroupId } from '@/lib/orbit/satCatalog'
import {
  browse,
  type BrowseList,
  type BrowseRow,
  buildBrowseIndex,
  countryOptions,
  DEFAULT_BROWSE_LIMIT,
} from '@/lib/orrery/satBrowse'
import type { SatGroupState } from '@/lib/orrery/satController'
import { ownerText } from '@/lib/satcatWords'
import { reentryWhen } from '@/lib/spaceTrackText'
import type { Reentry } from '@/schemas/spaceTrack'

import styles from './orrery.module.css'
import browserStyles from './satBrowser.module.css'
import {
  downloadText,
  SAT_TOGGLES,
  type SatToggle,
  type SatToggleId,
  type SatToggles,
  withToggleOn,
} from './satToggles'
import { useAllSatcat } from './useAllSatcat'

export interface SatBrowserProps {
  /** The loaded satellites (names, ids, groups, orbit classes, launches), or null. */
  field: SatFieldInfo | null
  toggles: SatToggles
  onToggles: (t: SatToggles) => void
  /** Each group's load state, for "loading" and for what is known of its size. */
  groups: Partial<Record<SatGroupId, SatGroupState>>
  /** Space-Track's predicted re-entries within the week, soonest first. */
  reentries: readonly Reentry[]
  reentryNames: Readonly<Record<string, string>>
  /** Space-Track's catalogue answered (re-entry predictions can be listed). */
  reentriesAvailable: boolean
  onChoose: (key: string) => void
  /** Opens the Earth orbit view, where the satellites load. */
  onOpenOrbit: () => void
}

type ListId = 'all' | 'kind' | 'orbit' | 'newest' | 'radar' | 'owner' | 'reentry'

const LISTS: { id: ListId; label: string; about: string; needsSatcat?: boolean }[] = [
  {
    id: 'all',
    label: 'Everything loaded',
    about: 'Every satellite in the kinds that are switched on.',
  },
  {
    id: 'kind',
    label: 'By kind',
    about: 'One of the groups: space stations, GPS, weather, science, Starlink and the rest.',
  },
  {
    id: 'orbit',
    label: 'By orbit',
    about:
      'How high and how fast it goes round: low, medium, the geostationary ring, or a long stretched orbit.',
  },
  {
    id: 'newest',
    label: 'Newest launches',
    about:
      'Newest first, by international designator (the year and launch number, such as 2026-100A) from CelesTrak.',
  },
  {
    id: 'radar',
    label: 'Biggest on radar',
    about:
      'Radar cross-section from the US Space Force catalogue, via Space-Track.org: large (over 1 m), then medium, then small. Many share a size.',
    needsSatcat: true,
  },
  {
    id: 'owner',
    label: 'By owner country',
    about:
      'Which country or agency owns it, from the US Space Force catalogue, via Space-Track.org.',
    needsSatcat: true,
  },
  {
    id: 'reentry',
    label: 'Re-entering soon',
    about:
      'Objects Space-Track.org predicts will fall back to Earth in the next 7 days. Some are rocket stages the orrery does not draw.',
  },
]

const ORBITS: { id: string; code: OrbitClassCode; label: string; about: string }[] = [
  {
    id: 'leo',
    code: ORBIT_LEO,
    label: 'Low orbit',
    about: 'Goes round 11 or more times a day: the ISS, Starlink, most imaging satellites.',
  },
  {
    id: 'meo',
    code: ORBIT_MEO,
    label: 'Medium orbit',
    about: 'Between low orbit and the geostationary ring. GPS goes round twice a day.',
  },
  {
    id: 'geo',
    code: ORBIT_GEO,
    label: 'Geostationary ring',
    about: 'Goes round once a day, so it seems to hang over one spot. About 36,000 km up.',
  },
  {
    id: 'heo',
    code: ORBIT_HEO,
    label: 'High or stretched',
    about: 'A very elongated orbit, or one slower than the geostationary ring.',
  },
]

const ORBIT_SHORT: Readonly<Record<number, string>> = {
  [ORBIT_LEO]: 'low orbit',
  [ORBIT_MEO]: 'medium orbit',
  [ORBIT_GEO]: 'geostationary',
  [ORBIT_HEO]: 'high orbit',
}

/** A table lookup by an id the component itself set: a miss is a bug, not a state. */
function must<T>(found: T | undefined): T {
  if (found === undefined) throw new Error('satellite browser: unknown option')
  return found
}

const GROUP_LABEL = new Map(SAT_GROUPS.map((g) => [g.id, g.label] as const))
const toggleById = (id: SatToggleId): SatToggle => must(SAT_TOGGLES.find((t) => t.id === id))

function whenDown(r: Reentry | undefined): string {
  return r ? `down ${reentryWhen(r)}` : ''
}

function rowMeta(row: BrowseRow, field: SatFieldInfo, reentry: Reentry | undefined): string {
  if (!row.drawn)
    return `NORAD ${row.id} · ${whenDown(reentry)} · not drawn: in no group the orrery carries`
  const parts = [`NORAD ${row.id}`]
  if (row.group) parts.push(GROUP_LABEL.get(row.group) ?? row.group)
  parts.push(ORBIT_SHORT[field.orbit[row.index] ?? 0] ?? '')
  const year = Math.floor((field.launch[row.index] ?? 0) / 1000)
  if (year > 0) parts.push(`launched ${String(year)}`)
  if (reentry) parts.push(whenDown(reentry))
  return parts.filter(Boolean).join(' · ')
}

/**
 * The satellite browser (#158): find satellites without knowing a name. A list to start
 * from, a filter on name or NORAD id, about 100 rows at a time. Choosing a row does what
 * choosing the ISS from search does. It ships in the OrreryPage chunk (a chunk of its own split the first load; see CLAUDE.md).
 */
export function SatBrowser(p: SatBrowserProps) {
  const [listId, setListId] = useState<ListId>('all')
  const [kind, setKind] = useState<SatToggleId>('stations')
  const [orbitId, setOrbitId] = useState('leo')
  const [country, setCountry] = useState('')
  const [text, setText] = useState('')
  const [wantSatcat, setWantSatcat] = useState(false)
  const filter = useDeferredValue(text)
  const ids = useId()

  const index = useMemo(() => (p.field ? buildBrowseIndex(p.field) : null), [p.field])
  const loadedIds = p.field?.ids ?? NO_IDS
  const { status: satcatStatus, satcat } = useAllSatcat(wantSatcat, loadedIds)
  const countries = useMemo(
    () => (index && satcat ? countryOptions(index, satcat) : []),
    [index, satcat],
  )
  const reentryMap = useMemo(
    () => new Map(p.reentries.map((r) => [r.noradId, { decayMs: Date.parse(r.decayEpoch) }])),
    [p.reentries],
  )
  const reentryById = useMemo(() => new Map(p.reentries.map((r) => [r.noradId, r])), [p.reentries])

  const meta = must(LISTS.find((l) => l.id === listId))
  const chosenCountry = country || countries[0]?.code || ''
  const list: BrowseList = useMemo(() => {
    switch (listId) {
      case 'kind':
        return { list: 'group', groups: toggleById(kind).groups }
      case 'orbit':
        return {
          list: 'orbit',
          orbit: must(ORBITS.find((o) => o.id === orbitId)).code,
        }
      case 'owner':
        return { list: 'owner', country: chosenCountry }
      default:
        return { list: listId }
    }
  }, [listId, kind, orbitId, chosenCountry])

  const result = useMemo(
    () =>
      index
        ? browse(index, {
            list,
            text: filter,
            satcat,
            reentries: reentryMap,
            reentryNames: p.reentryNames,
          })
        : { rows: [], total: 0 },
    [index, list, filter, satcat, reentryMap, p.reentryNames],
  )

  const kindToggle = toggleById(kind)
  const kindOff = listId === 'kind' && !p.toggles[kind]
  const off = SAT_TOGGLES.filter((t) => !p.toggles[t.id] && !(kindOff && t.id === kind))
  const turnOn = (id: SatToggleId) => {
    p.onToggles(withToggleOn(p.toggles, id))
  }
  const loading = Object.values(p.groups).some(
    (g) => g.status === 'loading' || g.status === 'waiting',
  )
  const nothingLoaded = !p.field || p.field.ids.length === 0
  const needsCatalogue = meta.needsSatcat === true && satcatStatus !== 'ready'
  const reentryDown = listId === 'reentry' && !p.reentriesAvailable

  return (
    <div className={browserStyles.browser ?? ''} data-sat-browser="">
      <label className={browserStyles.field ?? ''} htmlFor={`${ids}-list`}>
        <span>Browse by</span>
        <select
          id={`${ids}-list`}
          value={listId}
          onChange={(e) => {
            setListId(e.target.value as ListId)
          }}
        >
          {LISTS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <p className={styles.switchHint ?? ''}>{meta.about}</p>

      {listId === 'kind' && (
        <label className={browserStyles.field ?? ''} htmlFor={`${ids}-kind`}>
          <span>Kind</span>
          <select
            id={`${ids}-kind`}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as SatToggleId)
            }}
          >
            {SAT_TOGGLES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
                {p.toggles[t.id] ? '' : ' (off)'}
              </option>
            ))}
          </select>
        </label>
      )}
      {listId === 'kind' && <p className={styles.switchHint ?? ''}>{kindToggle.hint}</p>}

      {listId === 'orbit' && (
        <>
          <label className={browserStyles.field ?? ''} htmlFor={`${ids}-orbit`}>
            <span>Orbit</span>
            <select
              id={`${ids}-orbit`}
              value={orbitId}
              onChange={(e) => {
                setOrbitId(e.target.value)
              }}
            >
              {ORBITS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <p className={styles.switchHint ?? ''}>
            {must(ORBITS.find((o) => o.id === orbitId)).about}
          </p>
        </>
      )}

      {listId === 'owner' && satcatStatus === 'ready' && (
        <label className={browserStyles.field ?? ''} htmlFor={`${ids}-owner`}>
          <span>Owner</span>
          <select
            id={`${ids}-owner`}
            value={chosenCountry}
            onChange={(e) => {
              setCountry(e.target.value)
            }}
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {ownerText(c.code)}, {c.count.toLocaleString('en-US')}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className={browserStyles.field ?? ''} htmlFor={`${ids}-text`}>
        <span>Filter by name or NORAD number</span>
        <input
          id={`${ids}-text`}
          type="search"
          value={text}
          autoComplete="off"
          placeholder="Hubble, 25544, GOES…"
          onChange={(e) => {
            setText(e.target.value)
          }}
        />
      </label>

      {nothingLoaded && !kindOff && (
        <div className={browserStyles.note ?? ''}>
          <p className={styles.switchHint ?? ''} role="status">
            {loading
              ? 'Loading satellites…'
              : 'Satellites load once you are in the Earth orbit view.'}
          </p>
          <button type="button" className={styles.chipBtn ?? ''} onClick={p.onOpenOrbit}>
            Open the Earth orbit view
          </button>
        </div>
      )}

      {needsCatalogue && !nothingLoaded && (
        <div className={browserStyles.note ?? ''}>
          {satcatStatus === 'error' ? (
            <p className={styles.switchHint ?? ''} role="status">
              Space-Track’s catalogue isn’t available right now. The other lists still work.
            </p>
          ) : (
            <>
              <p className={styles.switchHint ?? ''}>
                This list uses Space-Track.org’s catalogue of every tracked object, a download of a
                few hundred kB.
              </p>
              <button
                type="button"
                className={styles.chipBtn ?? ''}
                disabled={satcatStatus === 'loading'}
                onClick={() => {
                  setWantSatcat(true)
                }}
              >
                {satcatStatus === 'loading'
                  ? 'Loading the catalogue…'
                  : 'Load Space-Track’s catalogue'}
              </button>
            </>
          )}
        </div>
      )}

      {kindOff && (
        <div className={browserStyles.note ?? ''}>
          <p className={styles.switchHint ?? ''}>
            {kindToggle.label} is switched off, so none are loaded.
          </p>
          <button
            type="button"
            className={styles.chipBtn ?? ''}
            onClick={() => {
              turnOn(kind)
            }}
          >
            Turn on {kindToggle.label} ({downloadText(kindToggle)})
          </button>
        </div>
      )}

      {reentryDown && (
        <p className={styles.switchHint ?? ''} role="status">
          Re-entry predictions aren’t available right now (Space-Track.org).
        </p>
      )}

      {index && !kindOff && !needsCatalogue && !reentryDown && (
        <>
          <p className={styles.switchHint ?? ''} role="status">
            {countLine(result.total, result.rows.length)}
          </p>
          <ul className={browserStyles.rows ?? ''}>
            {result.rows.map((row) => (
              <li key={row.id}>
                {row.drawn ? (
                  <button
                    type="button"
                    className={browserStyles.row ?? ''}
                    onClick={() => {
                      p.onChoose(row.key)
                    }}
                  >
                    <span className={browserStyles.name ?? ''}>{row.name}</span>
                    <span className={browserStyles.meta ?? ''}>
                      {p.field ? rowMeta(row, p.field, reentryById.get(row.id)) : ''}
                    </span>
                  </button>
                ) : (
                  <div className={browserStyles.row ?? ''} data-drawn="false">
                    <span className={browserStyles.name ?? ''}>{row.name}</span>
                    <span className={browserStyles.meta ?? ''}>
                      {p.field ? rowMeta(row, p.field, reentryById.get(row.id)) : ''}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {off.length > 0 && (
        <div role="group" aria-label="Switched off" className={browserStyles.off ?? ''}>
          <p className={styles.switchHint ?? ''}>
            Not in these lists because they are switched off. One tap loads each.
          </p>
          <div className={styles.chipRow ?? ''}>
            {off.map((t) => (
              <button
                key={t.id}
                type="button"
                className={styles.chipBtn ?? ''}
                onClick={() => {
                  turnOn(t.id)
                }}
              >
                Turn on {t.label} ({downloadText(t)})
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const NO_IDS: readonly string[] = []

function countLine(total: number, shown: number): string {
  if (total === 0) return 'Nothing matches. Try another list, or clear the filter.'
  const n = total.toLocaleString('en-US')
  if (total <= shown) return total === 1 ? '1 match.' : `${n} matches.`
  return `${n} matches. Showing the first ${String(DEFAULT_BROWSE_LIMIT)}; ${(total - shown).toLocaleString('en-US')} more, narrow it with the filter.`
}
