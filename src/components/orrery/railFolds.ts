/**
 * Which of the control rail's layer groups are open (#273). Learn, Find and View never fold;
 * the layer groups start folded except Solar system and Spacecraft, and a visitor's own
 * choice is kept in localStorage so it holds between visits. Not a cookie: a cookie would
 * ride every /api request. Storage can be missing or blocked (private mode, a policy, a
 * full disk, a getter that throws): every access is wrapped, and choices are also kept in
 * memory so they hold for the rest of the session.
 */
import { createContext } from 'react'

export const FOLDS_STORAGE_KEY = 'observatory.orrery.rail.v1'

/** The labels of the switches a reveal marks, so those rows show they were switched on for you. */
export const JustOnContext = createContext<readonly string[]>([])

export type FoldId = 'solar' | 'craft' | 'small' | 'near' | 'orbit'

const OPEN_AT_FIRST: ReadonlySet<FoldId> = new Set(['solar', 'craft'])

const inMemory = new Map<FoldId, boolean>()

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function stored(): Record<string, unknown> {
  try {
    const raw = storage()?.getItem(FOLDS_STORAGE_KEY) ?? null
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** Whether a group starts open: the visitor's last choice, else the default. */
export function foldOpen(id: FoldId): boolean {
  const remembered = inMemory.get(id)
  if (remembered !== undefined) return remembered
  const saved = stored()[id]
  return typeof saved === 'boolean' ? saved : OPEN_AT_FIRST.has(id)
}

/** Remember a visitor's own fold or unfold (not one the rail made by itself). */
export function rememberFold(id: FoldId, open: boolean): void {
  inMemory.set(id, open)
  try {
    storage()?.setItem(FOLDS_STORAGE_KEY, JSON.stringify({ ...stored(), [id]: open }))
  } catch {
    // Blocked or full: the in-memory choice still covers this session.
  }
}

/** For tests: forget the in-memory choices. */
export function resetFoldMemory(): void {
  inMemory.clear()
}

/** A folded group's readout of its switches: "Off", or "2 of 3 on". */
export function countReadout(on: number, of: number): string {
  return on === 0 ? 'Off' : `${String(on)} of ${String(of)} on`
}

/** What a group says when something outside the rail switched layers in it on. */
export function revealNote(labels: readonly string[]): string {
  if (labels.length <= 2) return `${labels.join(' and ')} switched on`
  return `${labels.slice(0, 2).join(', ')} and ${String(labels.length - 2)} more switched on`
}
