/**
 * The Earth orbit switches (#98): one per kind of satellite, over the nine stored
 * CelesTrak groups (the three debris clouds share one). Starlink starts off: it is more
 * than half the objects and a 480 kB download (gzip, measured 2026-11-12, #209), against
 * about 300 kB for everything else switched on; one tap adds it.
 */
import {
  EPOCH_WINDOW_MS,
  REENTRY_GROUP,
  type SatFieldGroup,
  type SatGroupId,
} from '@/lib/orbit/satCatalog'
import type { SatSnapshot } from '@/lib/orrery/satController'

export type SatToggleId =
  'stations' | 'starlink' | 'gps' | 'weather' | 'science' | 'other' | 'debris'

export interface SatToggle {
  id: SatToggleId
  label: string
  hint: string
  groups: readonly SatGroupId[]
  /**
   * The download when switched on, kB gzip, as /api/orrery-sats served it on 2026-11-07
   * (summed over the toggle's groups). The count is only known once a group has loaded.
   */
  downloadKb: number
}

export const SAT_TOGGLES: readonly SatToggle[] = [
  {
    id: 'stations',
    label: 'Space stations',
    hint: 'The ISS, China’s Tiangong, and the craft docked to them',
    groups: ['stations'],
    downloadKb: 1,
  },
  {
    id: 'starlink',
    label: 'Starlink',
    hint: 'SpaceX’s internet satellites, over 11,000 in low orbit, placed from SpaceX’s own orbit data where CelesTrak has it. A bigger download (about 0.5 MB)',
    groups: ['starlink'],
    // SupGP elements (#209): 477 kB at gzip -6 from the 2026-11-12 dry run, against 550 kB
    // for the GP body production served the same hour.
    downloadKb: 477,
  },
  {
    id: 'gps',
    label: 'GPS',
    hint: 'The US navigation satellites, about 20,000 km up',
    groups: ['gps-ops'],
    downloadKb: 2,
  },
  {
    id: 'weather',
    label: 'Weather',
    hint: 'Weather satellites in low orbit and in the geostationary ring',
    groups: ['weather'],
    downloadKb: 4.5,
  },
  {
    id: 'science',
    label: 'Science',
    hint: 'Space telescopes and Earth-science missions, Hubble among them',
    groups: ['science'],
    downloadKb: 3,
  },
  {
    id: 'other',
    label: 'Other active',
    hint: 'Every other working satellite CelesTrak tracks: communications, imaging, defence and more',
    groups: ['other'],
    downloadKb: 291,
  },
  {
    id: 'debris',
    label: 'Debris',
    hint: 'Pieces of three break-ups: China’s 2007 missile test on Fengyun-1C and the 2009 collision of Iridium 33 and Cosmos 2251',
    groups: ['fengyun-1c-debris', 'iridium-33-debris', 'cosmos-2251-debris'],
    downloadKb: 139,
  },
]

const TOGGLE_OF_GROUP = new Map(SAT_TOGGLES.flatMap((t) => t.groups.map((g) => [g, t.id] as const)))

/** The switch that turns a stored group on. */
export function toggleForGroup(group: SatGroupId): SatToggleId {
  return TOGGLE_OF_GROUP.get(group) ?? 'other'
}

/** The switch for a loaded object's group; none for a re-entry object, which has no switch (#154). */
export function toggleForFieldGroup(group: SatFieldGroup): SatToggleId | null {
  return group === REENTRY_GROUP ? null : toggleForGroup(group)
}

/** A download in plain words: "about 0.5 MB", "about 140 kB". */
export function downloadText(t: Pick<SatToggle, 'downloadKb'>): string {
  const kb = t.downloadKb
  if (kb >= 400) return `about ${String(Math.round(kb / 100) / 10)} MB`
  // Round to ten above 10 kB; below it, to a whole kB, never to nothing.
  const rounded = kb >= 10 ? Math.round(kb / 10) * 10 : Math.max(1, Math.round(kb))
  return `about ${String(rounded)} kB`
}

/** The toggles with one more on; the same object when it already was. */
export function withToggleOn(toggles: SatToggles, id: SatToggleId): SatToggles {
  return toggles[id] ? toggles : { ...toggles, [id]: true }
}

export type SatToggles = Readonly<Record<SatToggleId, boolean>>

export const DEFAULT_SAT_TOGGLES: SatToggles = {
  stations: true,
  starlink: false,
  gps: true,
  weather: true,
  science: true,
  other: true,
  debris: false,
}

/** Every switch on: a link to a satellite not in the default groups widens to this (#158). */
export const ALL_SAT_TOGGLES_ON: SatToggles = {
  stations: true,
  starlink: true,
  gps: true,
  weather: true,
  science: true,
  other: true,
  debris: true,
}

/** The stored groups the switches turn on. */
export function enabledSatGroups(toggles: SatToggles): Set<SatGroupId> {
  return new Set(SAT_TOGGLES.filter((t) => toggles[t.id]).flatMap((t) => t.groups))
}

const LABEL_OF = new Map(SAT_TOGGLES.flatMap((t) => t.groups.map((g) => [g, t.label] as const)))

/** The Earth orbit group's status line: what is loaded and how old, or why nothing is. */
export function satStatusText(s: SatSnapshot): string {
  const states = Object.entries(s.groups)
  const on = states.filter(([, g]) => g.status !== 'off')
  if (on.length === 0) return 'Every satellite group is switched off.'
  if (on.some(([, g]) => g.status === 'loading')) return 'Loading satellites from CelesTrak…'
  const failed = [
    ...new Set(
      on.filter(([, g]) => g.status === 'error').map(([id]) => LABEL_OF.get(id as SatGroupId)),
    ),
  ]
  const failures = failed
    .map((label) => ` ${label ?? 'A group'} is unavailable right now.`)
    .join('')
  const loaded = on.filter(([, g]) => g.status === 'loaded')
  if (loaded.length === 0) {
    return failed.length > 0
      ? failures.trim()
      : 'Shown once you zoom in to Earth: try the Earth orbit view.'
  }
  const ages = loaded.map(([, g]) => g.ageSeconds ?? 0)
  const hours = Math.max(1, Math.round(Math.max(...ages) / 3600))
  const old = loaded.some(([, g]) => g.degraded) ? ' (older than usual)' : ''
  // Some objects CelesTrak hasn't updated in days are left out even at today's date.
  const left =
    s.outOfWindow > 0
      ? ` ${s.outOfWindow.toLocaleString('en-US')} are left out: their orbit data is more than ${String(EPOCH_WINDOW_MS / 86_400_000)} days from this date.`
      : ''
  return `${s.total.toLocaleString('en-US')} satellites from CelesTrak, sampled ${String(hours)} h ago${old}.${left}${failures}`
}

/**
 * The stage notice for satellites left out by their epoch window: only once a real share
 * is (the clock has moved days from their data), not the few CelesTrak hasn't updated
 * lately, which the status line already counts.
 */
export const SAT_NOTICE_SHARE = 0.25

export function satHiddenNotice(hidden: number, total: number): string | null {
  if (total === 0 || hidden / total < SAT_NOTICE_SHARE) return null
  const why = `their orbit data is more than ${String(EPOCH_WINDOW_MS / 86_400_000)} days from this date, where it stops being accurate.`
  return hidden >= total
    ? `Satellites are hidden: ${why}`
    : `${hidden.toLocaleString('en-US')} satellites are hidden: ${why}`
}
